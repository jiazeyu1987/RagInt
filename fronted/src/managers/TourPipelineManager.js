// Flow-oriented tour pipeline manager extracted from App.js.
// Responsibilities:
// - Continuous tour state (active + token)
// - Prompt building for stops
// - Prefetch next stops via /api/ask (kind=ask_prefetch)
// - Cache prefetched answers (for UI + seamless stop transition)

export class TourPipelineManager {
  constructor(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    this._baseUrl = String(options.baseUrl || 'http://localhost:8000');
    this._getClientId = typeof options.getClientId === 'function' ? options.getClientId : () => '';
    this._getStops = typeof options.getStops === 'function' ? options.getStops : () => [];
    this._getLastAnswerTail = typeof options.getLastAnswerTail === 'function' ? options.getLastAnswerTail : () => '';
    this._getAudienceProfile = typeof options.getAudienceProfile === 'function' ? options.getAudienceProfile : () => '';
    this._getGuideDuration = typeof options.getGuideDuration === 'function' ? options.getGuideDuration : () => 60;
    this._getGuideStyle = typeof options.getGuideStyle === 'function' ? options.getGuideStyle : () => 'friendly';
    this._getGuideEnabled = typeof options.getGuideEnabled === 'function' ? options.getGuideEnabled : () => false;
    this._getPerStopDurations = typeof options.getPerStopDurations === 'function' ? options.getPerStopDurations : () => [];
    this._getPerStopTargetChars = typeof options.getPerStopTargetChars === 'function' ? options.getPerStopTargetChars : () => [];
    this._isContinuousTourEnabled =
      typeof options.isContinuousTourEnabled === 'function' ? options.isContinuousTourEnabled : () => false;
    this._getConversationConfig =
      typeof options.getConversationConfig === 'function'
        ? options.getConversationConfig
        : () => ({ useAgentMode: false, selectedChat: null, selectedAgentId: null });

    this._log = typeof options.onLog === 'function' ? options.onLog : () => {};
    this._warn = typeof options.onWarn === 'function' ? options.onWarn : () => {};

    this._active = false;
    this._token = 0;
    this._prefetchAbort = null;
    this._prefetchStore = new Map(); // stopIndex -> { answerText, tail, createdAt }
    this._stopsOverride = null;
  }

  isActive() {
    return this._active;
  }

  token() {
    return this._token;
  }

  getPrefetch(stopIndex) {
    const idx = Number(stopIndex);
    if (!Number.isFinite(idx)) return null;
    return this._prefetchStore.get(idx) || null;
  }

  clearPrefetchStore() {
    this._prefetchStore.clear();
  }

  abortPrefetch(reason) {
    const ctl = this._prefetchAbort;
    this._prefetchAbort = null;
    if (!ctl) return;
    try {
      ctl.abort();
      this._log('[PREFETCH] aborted', reason || 'unknown');
    } catch (_) {
      // ignore
    }
  }

  interrupt(reason) {
    this._active = false;
    this._token += 1;
    this._stopsOverride = null;
    this.clearPrefetchStore();
    this.abortPrefetch(reason || 'interrupt');
  }

  _stops() {
    const override = this._stopsOverride;
    if (Array.isArray(override) && override.length) return override;
    const stops = this._getStops();
    return Array.isArray(stops) ? stops : [];
  }

  _getStopName(index) {
    const stops = this._stops();
    if (!stops.length) return '';
    const i = Math.max(0, Math.min(Number(index) || 0, stops.length - 1));
    return String(stops[i] || '').trim();
  }

  buildTourPrompt(action, stopIndex, tailOverride) {
    const idx = Number.isFinite(stopIndex) ? stopIndex : 0;
    const stopName = this._getStopName(idx);
    const stops = this._stops();
    const n = stops.length;
    const title = stopName ? `第${idx + 1}站「${stopName}」` : `第${idx + 1}站`;
    const suffix = n ? `（共${n}站）` : '';
    const tail =
      tailOverride != null ? String(tailOverride || '').trim() : String(this._getLastAnswerTail() || '').trim();
    const tailHint = tail ? `\n\n【上一段结束语（供承接）】${tail}` : '';
    const profile = String(this._getAudienceProfile() || '').trim();
    const profileHint = profile ? `\n\n【人群画像】${profile}` : '';

    const durs = this._getPerStopDurations() || [];
    const targets = this._getPerStopTargetChars() || [];
    const fallbackDur = Math.max(15, Number(this._getGuideDuration() || 60) || 60);
    const dur = Number.isFinite(Number(durs[idx])) && Number(durs[idx]) > 0 ? Number(durs[idx]) : fallbackDur;
    const targetChars =
      Number.isFinite(Number(targets[idx])) && Number(targets[idx]) > 0
        ? Number(targets[idx])
        : Math.max(30, Math.round(dur * 4.5));
    const durHint = `\n\n【本站讲解时长】约${dur}秒（建议总字数约${targetChars}字，按中文语速估算）`;

    const isContinuous = !!(this._isContinuousTourEnabled() && this._active);
    const continuityHint = isContinuous
      ? `\n\n【衔接要求】连续讲解模式：上一站刚结束。\n- 开头不要重复“欢迎来到/接下来我们来到/让我们来到”等过渡话术。\n- 用1句自然承接上一站，再直接进入本站主题。\n- 结尾不要预告下一站（除非我明确要求）。`
      : '';

    if (action === 'start') {
      return `请开始展厅讲解：从${title}${suffix}开始，先给出1-2句开场白，再分点讲解本站重点。${durHint}${profileHint}`;
    }
    if (action === 'continue') {
      return `继续讲解${title}${suffix}：承接上一段内容，补充关键细节与示例，保持短句分段。${durHint}${tailHint}${profileHint}${continuityHint}`;
    }
    if (action === 'next') {
      if (isContinuous) {
        return `继续讲解：${title}${suffix}。\n请开始讲解：先用1句概括本站主题，再分点说明。${durHint}${tailHint}${profileHint}${continuityHint}`;
      }
      return `现在进入${title}${suffix}：请开始讲解，先概括本站主题，再分点说明。${durHint}${tailHint}${profileHint}`;
    }
    return '继续讲解';
  }

  async startContinuousTour({ startIndex, firstAction, askQuestion, stopsOverride }) {
    this._stopsOverride = Array.isArray(stopsOverride) && stopsOverride.length ? stopsOverride : null;
    const stops = this._stops();
    if (!stops.length) {
      this._warn('[TOUR] continuous: no stops loaded');
      return;
    }

    const token = ++this._token;
    this._active = true;
    this.abortPrefetch('continuous_start');

    const start = Math.max(0, Math.min(Number(startIndex) || 0, stops.length - 1));
    this._log('[TOUR] continuous start', `token=${token}`, `from=${start}`);

    try {
      const action = String(firstAction || 'start');
      const prompt = this.buildTourPrompt(action === 'continue' ? 'continue' : 'start', start);
      await askQuestion(prompt, { tourAction: action, tourStopIndex: start, continuous: true, continuousRoot: true });
    } finally {
      if (this._token === token) {
        this._active = false;
        this._stopsOverride = null;
        this.abortPrefetch('continuous_end');
        this._log('[TOUR] continuous end', `token=${token}`);
      }
    }
  }

  maybePrefetchNextStop({ currentStopIndex, tail, enqueueSegment, ensureTtsRunning }) {
    if (!this._isContinuousTourEnabled()) return;
    if (!this._active) return;
    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    const n = stops.length;
    const cur = Number.isFinite(currentStopIndex) ? Number(currentStopIndex) : -1;
    const nextIndex = cur + 1;
    if (!n || nextIndex < 0 || nextIndex >= n) return;
    const token = this._token;
    setTimeout(() => {
      this.prefetchStopTextToQueue({ stopIndex: nextIndex, tail, token, enqueueSegment, ensureTtsRunning });
    }, 0);
  }

  async prefetchStopTextToQueue({ stopIndex, tail, token, enqueueSegment, ensureTtsRunning }) {
    const idx = Number.isFinite(stopIndex) ? Number(stopIndex) : 0;
    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    if (!stops.length || idx < 0 || idx >= stops.length) return;
    if (!this._isContinuousTourEnabled()) return;
    if (!this._active) return;
    if (this._token !== token) return;

    if (this._prefetchStore.has(idx)) return;

    this.abortPrefetch('replace');
    const ctl = new AbortController();
    this._prefetchAbort = ctl;

    const prefetchAskId = `ask_prefetch_${token}_${idx}_${Date.now()}`;
    const prompt = this.buildTourPrompt('next', idx, tail);
    this._log('[PREFETCH] start', `stopIndex=${idx}`, `askId=${prefetchAskId}`);

    try {
      const conv = this._getConversationConfig() || {};
      const resp = await fetch(`${this._baseUrl}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this._getClientId(),
          'X-Request-ID': prefetchAskId,
        },
        body: JSON.stringify({
          question: prompt,
          request_id: prefetchAskId,
          client_id: this._getClientId(),
          kind: 'ask_prefetch',
          conversation_name: conv.useAgentMode ? null : conv.selectedChat,
          agent_id: conv.useAgentMode ? conv.selectedAgentId || null : null,
          guide: {
            enabled: !!this._getGuideEnabled(),
            duration_s: Math.max(15, Number(this._getGuideDuration() || 60) || 60),
            continuous: true,
            style: String(this._getGuideStyle() || 'friendly'),
          },
        }),
        signal: ctl.signal,
      });

      if (!resp.ok || !resp.body) throw new Error(`prefetch /api/ask http=${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let answerText = '';
      let gotAnySegment = false;

      while (true) {
        if (ctl.signal.aborted) break;
        if (!this._active || this._token !== token) break;
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = String(line || '').trim();
          if (!trimmed.startsWith('data: ')) continue;
          let data = null;
          try {
            data = JSON.parse(trimmed.slice(6));
          } catch (_) {
            continue;
          }
          if (data && data.chunk && !data.done) {
            answerText += String(data.chunk || '');
          }
          if (data && data.segment && !data.done) {
            const seg = String(data.segment || '').trim();
            if (seg) {
              gotAnySegment = true;
              try {
                if (enqueueSegment) enqueueSegment(seg, { stopIndex: idx, source: 'prefetch' });
                if (ensureTtsRunning) ensureTtsRunning();
              } catch (_) {
                // ignore
              }
            }
          }
          if (data && data.done) break;
        }
      }

      if (ctl.signal.aborted) return;
      if (!this._active || this._token !== token) return;

      const tailOut = String(answerText || '').trim().slice(-80);
      this._prefetchStore.set(idx, { answerText: String(answerText || ''), tail: tailOut, createdAt: Date.now() });
      this._log('[PREFETCH] ready', `stopIndex=${idx}`, `segments=${gotAnySegment ? 'yes' : 'no'}`);

      // Chain prefetch: once stop idx text is ready, start prefetching idx+1 (one-by-one) without waiting for TTS.
      const nextIndex = idx + 1;
      if (nextIndex < stops.length) {
        setTimeout(() => {
          this.prefetchStopTextToQueue({ stopIndex: nextIndex, tail: tailOut, token, enqueueSegment, ensureTtsRunning });
        }, 0);
      }
    } catch (e) {
      if (ctl.signal.aborted || String(e && e.name) === 'AbortError') return;
      this._warn('[PREFETCH] failed', e);
    } finally {
      if (this._prefetchAbort === ctl) this._prefetchAbort = null;
    }
  }
}
