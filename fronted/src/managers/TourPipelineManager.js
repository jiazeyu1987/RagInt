// Flow-oriented tour pipeline manager extracted from App.js.
// Responsibilities:
// - Continuous tour state (active + interrupt epoch)
// - Prompt building for stops
// - Prefetch next stops via /api/ask (kind=ask_prefetch)
// - Cache prefetched answers (for UI + seamless stop transition)

export class TourPipelineManager {
  constructor(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    this._baseUrl = String(options.baseUrl || '');
    this._getClientId = typeof options.getClientId === 'function' ? options.getClientId : () => '';
    this._getStops = typeof options.getStops === 'function' ? options.getStops : () => [];
    this._getLastAnswerTail = typeof options.getLastAnswerTail === 'function' ? options.getLastAnswerTail : () => '';
    this._getInterruptEpoch = typeof options.getInterruptEpoch === 'function' ? options.getInterruptEpoch : () => 0;
    this._isInterruptEpochCurrent =
      typeof options.isInterruptEpochCurrent === 'function'
        ? options.isInterruptEpochCurrent
        : (epoch) => Number(epoch) === Number(this._getInterruptEpoch());
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
    this._getRecordingId = typeof options.getRecordingId === 'function' ? options.getRecordingId : () => '';
    this._getPlaybackRecordingId =
      typeof options.getPlaybackRecordingId === 'function' ? options.getPlaybackRecordingId : () => '';

    this._maxPrefetchAhead = Math.max(0, Number(options.maxPrefetchAhead ?? 1) || 1);

    this._log = typeof options.onLog === 'function' ? options.onLog : () => {};
    this._warn = typeof options.onWarn === 'function' ? options.onWarn : () => {};

    this._active = false;
    this._prefetchAbort = null;
    this._prefetchStore = new Map(); // stopIndex -> { answerText, tail, createdAt, segments }
    this._stopsOverride = null;
    this._currentStopIndex = -1;
  }

  isActive() {
    return this._active;
  }

  getPrefetch(stopIndex) {
    const idx = Number(stopIndex);
    if (!Number.isFinite(idx)) return null;
    return this._prefetchStore.get(idx) || null;
  }

  replayPrefetchToQueue({ stopIndex, enqueueSegment, ensureTtsRunning } = {}) {
    const idx = Number(stopIndex);
    if (!Number.isFinite(idx)) return false;

    const cached = this._prefetchStore.get(idx);
    if (!cached) return false;

    const segs = Array.isArray(cached.segments) && cached.segments.length ? cached.segments : null;
    const fallback = !segs && String(cached.answerText || '').trim() ? [String(cached.answerText || '').trim()] : null;
    const list = segs || fallback;
    if (!list || !list.length) return false;

    for (const s of list) {
      const t = String(s || '').trim();
      if (!t) continue;
      try {
        if (enqueueSegment) enqueueSegment(t, { stopIndex: idx, source: 'prefetch_replay' });
        if (ensureTtsRunning) ensureTtsRunning();
      } catch (_) {
        // ignore
      }
    }

    return true;
  }

  replayPrefetchAudioToQueue({ stopIndex, enqueueAudioSegment, ensureTtsRunning } = {}) {
    const idx = Number(stopIndex);
    if (!Number.isFinite(idx)) return false;
    const cached = this._prefetchStore.get(idx);
    if (!cached) return false;
    const list = Array.isArray(cached.audioSegments) ? cached.audioSegments : null;
    if (!list || !list.length) return false;

    for (const seg of list) {
      const url = seg && seg.audio_url ? String(seg.audio_url || '').trim() : '';
      const text = seg && seg.text ? String(seg.text || '') : '';
      if (!url) continue;
      try {
        if (enqueueAudioSegment) enqueueAudioSegment(url, { stopIndex: idx, text, source: 'prefetch_replay' });
        if (ensureTtsRunning) ensureTtsRunning();
      } catch (_) {
        // ignore
      }
    }

    return true;
  }

  clearPrefetchStore() {
    this._prefetchStore.clear();
  }

  setCurrentStopIndex(idx) {
    const n = Number(idx);
    if (!Number.isFinite(n)) return;
    this._currentStopIndex = n;
  }

  getCurrentStopIndex() {
    return Number.isFinite(this._currentStopIndex) ? this._currentStopIndex : -1;
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
    this._stopsOverride = null;
    this._currentStopIndex = -1;
    this.clearPrefetchStore();
    this.abortPrefetch(reason || 'interrupt');
  }

  pause(reason) {
    // Manual pause: stop any prefetch/enqueue without clearing cached store.
    this._active = false;
    this.abortPrefetch(reason || 'pause');
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

  _compressTailForContinuity(rawTail) {
    const tail = String(rawTail || '').trim();
    if (!tail) return '';

    // If the previous answer already contains transition words, suppress tail echo.
    const hints = ['接下来', '下一站', '继续参观', '请大家跟我来', '我们来到', '让我们来到', '欢迎来到'];
    for (const h of hints) {
      if (tail.includes(h)) return '';
    }

    const maxLen = 80;
    let out = tail;
    if (out.length > maxLen) out = out.slice(-maxLen);
    out = out.replace(/^[,.;:\s，。；：]+/g, '').replace(/[,.;:\s，。；：]+$/g, '');
    return out;
  }

  buildTourPrompt(action, stopIndex, tailOverride) {
    const idx = Number.isFinite(stopIndex) ? stopIndex : 0;
    const stopName = this._getStopName(idx);
    const stops = this._stops();
    const n = stops.length;
    const title = stopName ? `第${idx + 1}站“${stopName}”` : `第${idx + 1}站`;
    const suffix = n ? `（共${n}站）` : '';

    const rawTail =
      tailOverride != null ? String(tailOverride || '').trim() : String(this._getLastAnswerTail() || '').trim();
    const profile = String(this._getAudienceProfile() || '').trim();
    const profileHint = profile ? `\n受众：${profile}` : '';

    const durs = this._getPerStopDurations() || [];
    const targets = this._getPerStopTargetChars() || [];
    const fallbackDur = Math.max(15, Number(this._getGuideDuration() || 60) || 60);
    const dur = Number.isFinite(Number(durs[idx])) && Number(durs[idx]) > 0 ? Number(durs[idx]) : fallbackDur;
    const targetChars =
      Number.isFinite(Number(targets[idx])) && Number(targets[idx]) > 0
        ? Number(targets[idx])
        : Math.max(30, Math.round(dur * 4.5));
    const durHint = `\n时长：约${dur}秒，建议约${targetChars}字。`;

    const isContinuous = !!(this._isContinuousTourEnabled() && this._active);
    const tail = isContinuous ? this._compressTailForContinuity(rawTail) : rawTail;
    const tailHint = tail ? `\n上一段结尾（用于承接）：${tail}` : '';
    const continuityHint = isContinuous
      ? '\n连续讲解要求：自然承接上一站，直接进入当前站主题，不要寒暄，不要预告下一站。'
      : '';

    const outputHint =
      '\n输出要求：只输出一段连续讲解正文，不要分点，不要标题，不要列表，不要使用【】[]#*等特殊格式符号；必须使用基础标点（，。；：！？）自然断句。';
    const languageHint = '\n语言要求：口语化、可直接播报、句子顺畅。';

    if (action === 'start') {
      return `请开始讲解${title}${suffix}，生成用于口播的一段讲解稿。${durHint}${profileHint}${outputHint}${languageHint}`;
    }
    if (action === 'continue') {
      return `继续讲解${title}${suffix}，承接上一段内容，生成用于口播的一段讲解稿。${durHint}${tailHint}${profileHint}${continuityHint}${outputHint}${languageHint}`;
    }
    if (action === 'next') {
      return `现在进入${title}${suffix}，请生成用于口播的一段讲解稿。${durHint}${tailHint}${profileHint}${continuityHint}${outputHint}${languageHint}`;
    }
    return '继续讲解，输出一段可直接播报的中文正文。';
  }
  async startContinuousTour({ startIndex, firstAction, askQuestion, stopsOverride }) {
    this._stopsOverride = Array.isArray(stopsOverride) && stopsOverride.length ? stopsOverride : null;
    const stops = this._stops();
    if (!stops.length) {
      this._warn('[TOUR] continuous: no stops loaded');
      return;
    }

    const epoch = this._getInterruptEpoch();
    this._active = true;
    this.abortPrefetch('continuous_start');

    const start = Math.max(0, Math.min(Number(startIndex) || 0, stops.length - 1));
    this._log('[TOUR] continuous start', `epoch=${epoch}`, `from=${start}`);

    try {
      const action = String(firstAction || 'start');
      const promptAction = action === 'continue' ? 'continue' : action === 'next' ? 'next' : 'start';
      const prompt = this.buildTourPrompt(promptAction, start);
      await askQuestion(prompt, { tourAction: action, tourStopIndex: start, continuous: true, continuousRoot: true });
    } finally {
      // Keep continuous mode active after the root ask returns.
      // Next stops are fetched asynchronously and enqueued by prefetch callbacks.
      // If we mark inactive here, those callbacks are canceled and auto-advance stops after the first stop.
      if (!this._isInterruptEpochCurrent(epoch)) {
        this._active = false;
        this._stopsOverride = null;
        this.abortPrefetch('continuous_end_interrupted');
        this._log('[TOUR] continuous end (interrupted)', `epoch=${epoch}`);
      }
    }
  }

  maybePrefetchNextStop({ currentStopIndex, tail, enqueueSegment, ensureTtsRunning }) {
    if (!this._isContinuousTourEnabled()) return;
    if (!this._active) return;
    this.setCurrentStopIndex(currentStopIndex);
    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    const n = stops.length;
    const cur = Number.isFinite(currentStopIndex) ? Number(currentStopIndex) : -1;
    const nextIndex = cur + 1;
    if (!n || nextIndex < 0 || nextIndex >= n) return;

    // Keep a small prefetch window to avoid main-thread pressure (ScriptProcessorNode) and reduce stutter.
    if (this._maxPrefetchAhead >= 0) {
      const base = this.getCurrentStopIndex();
      if (base >= 0 && nextIndex > base + this._maxPrefetchAhead) return;
    }

    const epoch = this._getInterruptEpoch();
    setTimeout(() => {
      this.prefetchStopTextToQueue({ stopIndex: nextIndex, tail, epoch, enqueueSegment, ensureTtsRunning });
    }, 0);
  }

  maybePrefetchNextStopFromRecording({ recordingId, currentStopIndex, enqueueAudioSegment, ensureTtsRunning }) {
    const rid = String(recordingId || '').trim() || String(this._getPlaybackRecordingId() || '').trim();
    if (!rid) return;
    if (!this._isContinuousTourEnabled()) return;
    if (!this._active) return;
    this.setCurrentStopIndex(currentStopIndex);
    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    const n = stops.length;
    const cur = Number.isFinite(currentStopIndex) ? Number(currentStopIndex) : -1;
    const nextIndex = cur + 1;
    if (!n || nextIndex < 0 || nextIndex >= n) return;

    if (this._maxPrefetchAhead >= 0) {
      const base = this.getCurrentStopIndex();
      if (base >= 0 && nextIndex > base + this._maxPrefetchAhead) return;
    }

    if (this._prefetchStore.has(nextIndex)) return;

    const epoch = this._getInterruptEpoch();
    setTimeout(() => {
      this.prefetchStopFromRecordingToQueue({
        recordingId: rid,
        stopIndex: nextIndex,
        epoch,
        enqueueAudioSegment,
        ensureTtsRunning,
      });
    }, 0);
  }

  maybePrefetchFromPlayback({ currentStopIndex, enqueueSegment, ensureTtsRunning }) {
    if (!this._isContinuousTourEnabled()) return;
    if (!this._active) return;
    const cur = Number.isFinite(currentStopIndex) ? Number(currentStopIndex) : -1;
    if (cur < 0) return;
    this.setCurrentStopIndex(cur);

    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    const n = stops.length;
    const nextIndex = cur + 1;
    if (!n || nextIndex < 0 || nextIndex >= n) return;
    if (this._maxPrefetchAhead >= 0 && nextIndex > cur + this._maxPrefetchAhead) return;
    if (this._prefetchStore.has(nextIndex)) return;

    const tail =
      (this._prefetchStore.get(cur) && this._prefetchStore.get(cur).tail) ||
      String(this._getLastAnswerTail() || '').trim().slice(-80);

    const epoch = this._getInterruptEpoch();
    setTimeout(() => {
      this.prefetchStopTextToQueue({ stopIndex: nextIndex, tail, epoch, enqueueSegment, ensureTtsRunning });
    }, 0);
  }

  maybePrefetchFromRecordingPlayback({ recordingId, currentStopIndex, enqueueAudioSegment, ensureTtsRunning }) {
    const rid = String(recordingId || '').trim() || String(this._getPlaybackRecordingId() || '').trim();
    if (!rid) return;
    if (!this._isContinuousTourEnabled()) return;
    if (!this._active) return;
    const cur = Number.isFinite(currentStopIndex) ? Number(currentStopIndex) : -1;
    if (cur < 0) return;
    this.setCurrentStopIndex(cur);

    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    const n = stops.length;
    const nextIndex = cur + 1;
    if (!n || nextIndex < 0 || nextIndex >= n) return;
    if (this._maxPrefetchAhead >= 0 && nextIndex > cur + this._maxPrefetchAhead) return;
    if (this._prefetchStore.has(nextIndex)) return;

    const epoch = this._getInterruptEpoch();
    setTimeout(() => {
      this.prefetchStopFromRecordingToQueue({
        recordingId: rid,
        stopIndex: nextIndex,
        epoch,
        enqueueAudioSegment,
        ensureTtsRunning,
      });
    }, 0);
  }

  async prefetchStopTextToQueue({ stopIndex, tail, epoch, enqueueSegment, ensureTtsRunning, force } = {}) {
    const idx = Number.isFinite(stopIndex) ? Number(stopIndex) : 0;
    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    if (!stops.length || idx < 0 || idx >= stops.length) return;
    if (!this._isContinuousTourEnabled()) return;
    if (!force && !this._active) return;
    if (!this._isInterruptEpochCurrent(epoch)) return;

    if (this._prefetchStore.has(idx)) return;

    this.abortPrefetch('replace');
    const ctl = new AbortController();
    this._prefetchAbort = ctl;

    const prefetchAskId = `ask_prefetch_${epoch}_${idx}_${Date.now()}`;
    const prompt = this.buildTourPrompt('next', idx, tail);
    this._log('[PREFETCH] start', `stopIndex=${idx}`, `askId=${prefetchAskId}`);

    try {
      const conv = this._getConversationConfig() || {};
      const recordingId = String(this._getRecordingId() || '').trim();
      const resp = await fetch(`${this._baseUrl}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this._getClientId(),
          'X-Request-ID': prefetchAskId,
          ...(recordingId ? { 'X-Recording-ID': recordingId } : {}),
        },
        body: JSON.stringify({
          question: prompt,
          request_id: prefetchAskId,
          client_id: this._getClientId(),
          kind: 'ask_prefetch',
          recording_id: recordingId || null,
          conversation_name: conv.useAgentMode ? null : conv.selectedChat,
          agent_id: conv.useAgentMode ? conv.selectedAgentId || null : null,
          guide: {
            enabled: !!this._getGuideEnabled(),
            duration_s: Math.max(15, Number(this._getGuideDuration() || 60) || 60),
            continuous: true,
            style: String(this._getGuideStyle() || 'friendly'),
            stop_index: idx,
            stop_name: this._getStopName(idx),
            tour_action: 'next',
            action_type: '鍒囩珯',
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
      const segments = [];

      while (true) {
        if (ctl.signal.aborted) break;
        if (!this._isContinuousTourEnabled()) break;
        if ((!force && !this._active) || !this._isInterruptEpochCurrent(epoch)) break;
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';
        for (const line of lines) {
          if (ctl.signal.aborted) break;
          if (!this._isInterruptEpochCurrent(epoch)) break;
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
              segments.push(seg);
              try {
                if (!this._isInterruptEpochCurrent(epoch)) break;
                if (enqueueSegment) enqueueSegment(seg, { stopIndex: idx, source: 'prefetch' });
                if (!this._isInterruptEpochCurrent(epoch)) break;
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
      if (!this._isContinuousTourEnabled()) return;
      if ((!force && !this._active) || !this._isInterruptEpochCurrent(epoch)) return;

      const tailOut = String(answerText || '').trim().slice(-80);
      this._prefetchStore.set(idx, { answerText: String(answerText || ''), tail: tailOut, createdAt: Date.now(), segments });
      this._log('[PREFETCH] ready', `stopIndex=${idx}`, `segments=${gotAnySegment ? 'yes' : 'no'}`);

      // Limited chain prefetch: keep at most `_maxPrefetchAhead` stops ahead of current playback.
      const cur = this.getCurrentStopIndex();
      const nextIndex = idx + 1;
      if (nextIndex < stops.length) {
        const base = cur >= 0 ? cur : idx;
        if (nextIndex <= base + this._maxPrefetchAhead && !this._prefetchStore.has(nextIndex)) {
          setTimeout(() => {
            this.prefetchStopTextToQueue({ stopIndex: nextIndex, tail: tailOut, epoch, enqueueSegment, ensureTtsRunning, force });
          }, 0);
        }
      }
    } catch (e) {
      if (ctl.signal.aborted || String(e && e.name) === 'AbortError') return;
      this._warn('[PREFETCH] failed', e);
    } finally {
      if (this._prefetchAbort === ctl) this._prefetchAbort = null;
    }
  }

  async prefetchStopFromRecordingToQueue({ recordingId, stopIndex, epoch, enqueueAudioSegment, ensureTtsRunning } = {}) {
    const rid = String(recordingId || '').trim();
    const idx = Number.isFinite(stopIndex) ? Number(stopIndex) : 0;
    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    if (!rid) return;
    if (!stops.length || idx < 0 || idx >= stops.length) return;
    if (!this._isContinuousTourEnabled()) return;
    if (!this._active) return;
    if (!this._isInterruptEpochCurrent(epoch)) return;
    if (this._prefetchStore.has(idx)) return;

    this.abortPrefetch('replace');
    const ctl = new AbortController();
    this._prefetchAbort = ctl;

    const url = `${this._baseUrl}/api/recordings/${encodeURIComponent(rid)}/stop/${encodeURIComponent(String(idx))}`;
    this._log('[PREFETCH_REC] start', `stopIndex=${idx}`, `recording=${rid}`);

    try {
      const resp = await fetch(url, { method: 'GET', signal: ctl.signal });
      if (!resp.ok) throw new Error(`prefetch_rec http=${resp.status}`);
      const data = await resp.json();
      if (ctl.signal.aborted) return;
      if (!this._active || !this._isInterruptEpochCurrent(epoch)) return;

      const answerText = String((data && data.answer_text) || '');
      const tailOut = String((data && data.tail) || '').trim().slice(-80) || answerText.trim().slice(-80);
      const audioSegments = Array.isArray(data && data.segments) ? data.segments : [];
      this._prefetchStore.set(idx, { answerText, tail: tailOut, createdAt: Date.now(), audioSegments });
      this._log('[PREFETCH_REC] ready', `stopIndex=${idx}`, `segments=${audioSegments.length}`);

      if (enqueueAudioSegment && audioSegments.length) {
        for (const s of audioSegments) {
          const u = s && s.audio_url ? String(s.audio_url || '').trim() : '';
          const t = s && s.text ? String(s.text || '') : '';
          if (!u) continue;
          try {
            enqueueAudioSegment(u, { stopIndex: idx, text: t, source: 'prefetch_rec' });
            if (ensureTtsRunning) ensureTtsRunning();
          } catch (_) {
            // ignore
          }
        }
      }

      // Chain within the same prefetch window.
      const cur = this.getCurrentStopIndex();
      const nextIndex = idx + 1;
      if (nextIndex < stops.length) {
        const base = cur >= 0 ? cur : idx;
        if (nextIndex <= base + this._maxPrefetchAhead && !this._prefetchStore.has(nextIndex)) {
          setTimeout(() => {
            this.prefetchStopFromRecordingToQueue({
              recordingId: rid,
              stopIndex: nextIndex,
              epoch,
              enqueueAudioSegment,
              ensureTtsRunning,
            });
          }, 0);
        }
      }
    } catch (e) {
      if (ctl.signal.aborted || String(e && e.name) === 'AbortError') return;
      this._warn('[PREFETCH_REC] failed', e);
    } finally {
      if (this._prefetchAbort === ctl) this._prefetchAbort = null;
    }
  }
}

