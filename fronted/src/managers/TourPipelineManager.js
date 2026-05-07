// Flow-oriented tour pipeline manager extracted from App.js.
// Responsibilities:
// - Continuous tour state (active + interrupt epoch)
// - Prompt building for stops
// - Prefetch next stops via /api/ask (kind=ask_prefetch)
// - Cache prefetched answers (for UI + seamless stop transition)

import { ragflowChunkManager } from './RagflowChunkManager';
import { normalizeBaseUrl, requirePositiveNumber } from './tourPipelineUtils';

export class TourPipelineManager {
  constructor(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    this._baseUrl = normalizeBaseUrl(options.baseUrl);
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
    this._getPerStopPrompts = typeof options.getPerStopPrompts === 'function' ? options.getPerStopPrompts : () => ({});
    this._isContinuousTourEnabled =
      typeof options.isContinuousTourEnabled === 'function' ? options.isContinuousTourEnabled : () => false;
    this._getConversationConfig =
      typeof options.getConversationConfig === 'function'
        ? options.getConversationConfig
        : () => ({ useAgentMode: false, selectedChat: null, selectedAgentId: null });
    this._getRecordingId = typeof options.getRecordingId === 'function' ? options.getRecordingId : () => '';
    this._getPlaybackRecordingId =
      typeof options.getPlaybackRecordingId === 'function' ? options.getPlaybackRecordingId : () => '';
    this._ragflowChunkManager = options.ragflowChunkManager || ragflowChunkManager;

    this._maxPrefetchAhead = Math.max(0, Number(options.maxPrefetchAhead ?? 1) || 1);

    this._log = typeof options.onLog === 'function' ? options.onLog : () => {};
    this._warn = typeof options.onWarn === 'function' ? options.onWarn : () => {};

    this._active = false;
    this._prefetchAbort = null;
    this._prefetchStore = new Map(); // stopIndex -> { answerText, tail, createdAt, segments }
    this._stopsOverride = null;
    this._currentStopIndex = -1;
  }

  _url(path) {
    const p = String(path || '');
    const normalized = p.startsWith('/') ? p : `/${p}`;
    return this._baseUrl ? `${this._baseUrl}${normalized}` : normalized;
  }

  _observeAsyncPrefetch(task, warningPrefix) {
    try {
      const result = task();
      if (result && typeof result.catch === 'function') {
        result.catch((e) => {
          this._warn(warningPrefix, e);
        });
      }
    } catch (e) {
      this._warn(warningPrefix, e);
    }
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

    const list = Array.isArray(cached.segments) && cached.segments.length ? cached.segments : null;
    if (!list || !list.length) return false;

    for (const s of list) {
      const t = String(s || '').trim();
      if (!t) continue;
      if (enqueueSegment) enqueueSegment(t, { stopIndex: idx, source: 'prefetch_replay' });
      if (ensureTtsRunning) ensureTtsRunning();
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
      if (enqueueAudioSegment) enqueueAudioSegment(url, { stopIndex: idx, text, source: 'prefetch_replay' });
      if (ensureTtsRunning) ensureTtsRunning();
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

  _getPerStopPromptByIndex(index) {
    const idx = Number.isFinite(index) ? Number(index) : 0;
    const stopName = this._getStopName(idx);
    if (!stopName) return '';
    const promptMap = this._getPerStopPrompts();
    if (!promptMap || typeof promptMap !== 'object' || Array.isArray(promptMap)) return '';
    return String(promptMap[stopName] || '').trim();
  }

  _hasPlaybackRecording() {
    return !!String(this._getPlaybackRecordingId() || '').trim();
  }

  _canAutoAdvance({ allowPlaybackRecording = false } = {}) {
    if (this._isContinuousTourEnabled()) return true;
    return !!(allowPlaybackRecording && this._hasPlaybackRecording());
  }

  _compressTailForContinuity(rawTail) {
    const tail = String(rawTail || "").trim();
    if (!tail) return "";

    // If the previous answer already contains transition words, suppress tail echo.
    const hints = [
      "\u63a5\u4e0b\u6765",
      "\u4e0b\u4e00\u7ad9",
      "\u7ee7\u7eed\u53c2\u89c2",
      "\u8bf7\u5927\u5bb6\u8ddf\u6211\u6765",
      "\u6211\u4eec\u6765\u5230",
      "\u8ba9\u6211\u4eec\u6765\u5230",
      "\u6b22\u8fce\u6765\u5230",
    ];
    for (const h of hints) {
      if (tail.includes(h)) return "";
    }

    const maxLen = 80;
    let out = tail;
    if (out.length > maxLen) out = out.slice(-maxLen);
    out = out.replace(/^[,.;:\s\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F]+/g, "").replace(/[,.;:\s\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F]+$/g, "");
    return out;
  }

  buildTourPrompt(action, stopIndex, tailOverride) {
    const idx = Number.isFinite(stopIndex) ? Number(stopIndex) : 0;
    const stopName = this._getStopName(idx);
    const stops = this._stops();
    const n = stops.length;
    const title = stopName ? `\u7b2c${idx + 1}\u7ad9\u300c${stopName}\u300d` : `\u7b2c${idx + 1}\u7ad9`;
    const suffix = n ? `\uff08\u5171${n}\u7ad9\uff09` : "";

    const rawTail =
      tailOverride != null ? String(tailOverride || "").trim() : String(this._getLastAnswerTail() || "").trim();
    const profile = String(this._getAudienceProfile() || "").trim();
    const profileHint = profile ? `\n\u3010\u4eba\u7fa4\u753b\u50cf\u3011${profile}` : "";

    const durs = this._getPerStopDurations() || [];
    const targets = this._getPerStopTargetChars() || [];
    const guideDuration = requirePositiveNumber(this._getGuideDuration(), 'guide_duration_required');
    const dur = Number.isFinite(Number(durs[idx])) && Number(durs[idx]) > 0 ? Number(durs[idx]) : guideDuration;
    const targetChars =
      Number.isFinite(Number(targets[idx])) && Number(targets[idx]) > 0
        ? Number(targets[idx])
        : Math.max(30, Math.round(dur * 4.5));
    const durHint = `\n\u3010\u672c\u7ad9\u8bb2\u89e3\u65f6\u957f\u3011\u7ea6${dur}\u79d2\uff08\u5efa\u8bae\u603b\u5b57\u6570\u7ea6${targetChars}\u5b57\uff09`;

    const perStopPrompt = this._getPerStopPromptByIndex(idx);
    const perStopHint = perStopPrompt ? `\n\u3010\u672c\u7ad9\u9644\u52a0\u63d0\u793a\u8bcd\u3011${perStopPrompt}` : "";

    const isContinuous = !!(this._canAutoAdvance({ allowPlaybackRecording: false }) && this._active);
    const tail = isContinuous ? this._compressTailForContinuity(rawTail) : rawTail;
    const tailHint = tail ? `\n\u3010\u4e0a\u4e00\u6bb5\u7ed3\u675f\u8bed\uff08\u4f9b\u627f\u63a5\uff09\u3011${tail}` : "";
    const continuityHint = isContinuous
      ? "\n\u3010\u8854\u63a5\u8981\u6c42\u3011\u8fde\u7eed\u8bb2\u89e3\u6a21\u5f0f\uff1a\u4e0a\u4e00\u7ad9\u521a\u7ed3\u675f\u3002\u5f00\u5934\u81ea\u7136\u627f\u63a5\uff0c\u4e0d\u8981\u4f7f\u7528\u56fa\u5b9a\u8fc7\u6e21\u8bdd\u672f\uff1b\u7ed3\u5c3e\u4e0d\u8981\u9884\u544a\u4e0b\u4e00\u7ad9\u3002"
      : "";

    const outputHint =
      "\n\u3010\u8f93\u51fa\u683c\u5f0f\u8981\u6c42\u3011\u53ea\u8f93\u51fa\u4e00\u6574\u6bb5\u8fde\u7eed\u8bb2\u89e3\u6b63\u6587\uff0c\u4e0d\u8981\u5206\u70b9\u3001\u4e0d\u8981\u6807\u9898\u3001\u4e0d\u8981\u5217\u8868\uff0c\u4e0d\u8981\u4f7f\u7528\u7279\u6b8a\u683c\u5f0f\u7b26\u53f7\uff08\u5982\u3010\u3011[]#*\u7b49\uff09\uff0c\u5fc5\u987b\u4f7f\u7528\u57fa\u7840\u6807\u70b9\uff08\uff0c\u3002\uff1b\uff1a\uff01\uff1f\uff09\u81ea\u7136\u65ad\u53e5\u3002";
    const languageHint = "\n\u3010\u8bed\u8a00\u8981\u6c42\u3011\u53e3\u8bed\u5316\u3001\u81ea\u7136\u8fde\u8d2f\u3001\u53ef\u76f4\u63a5\u7528\u4e8e\u8bed\u97f3\u64ad\u62a5\u3002";

    if (action === "start") {
      return `\u8bf7\u5f00\u59cb\u8bb2\u89e3\uff1a${title}${suffix}\u3002${durHint}${profileHint}${perStopHint}${outputHint}${languageHint}`;
    }
    if (action === "continue") {
      return `\u7ee7\u7eed\u8bb2\u89e3\uff1a${title}${suffix}\u3002${durHint}${tailHint}${profileHint}${perStopHint}${continuityHint}${outputHint}${languageHint}`;
    }
    if (action === "next") {
      return `\u8bf7\u8bb2\u89e3\u4e0b\u4e00\u7ad9\uff1a${title}${suffix}\u3002${durHint}${tailHint}${profileHint}${perStopHint}${continuityHint}${outputHint}${languageHint}`;
    }
    return "\u8bf7\u8f93\u51fa\u4e00\u6bb5\u53ef\u76f4\u63a5\u8bed\u97f3\u64ad\u62a5\u7684\u4e2d\u6587\u8bb2\u89e3\u6b63\u6587\u3002";
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
    if (!this._canAutoAdvance()) return;
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
      this._observeAsyncPrefetch(
        () => this.prefetchStopTextToQueue({ stopIndex: nextIndex, tail, epoch, enqueueSegment, ensureTtsRunning }),
        '[PREFETCH] async failed'
      );
    }, 0);
  }

  maybePrefetchNextStopFromRecording({ recordingId, currentStopIndex, enqueueAudioSegment, ensureTtsRunning }) {
    const rid = String(recordingId || '').trim() || String(this._getPlaybackRecordingId() || '').trim();
    if (!rid) return;
    if (!this._canAutoAdvance({ allowPlaybackRecording: true })) return;
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
      this._observeAsyncPrefetch(
        () =>
          this.prefetchStopFromRecordingToQueue({
            recordingId: rid,
            stopIndex: nextIndex,
            epoch,
            enqueueAudioSegment,
            ensureTtsRunning,
          }),
        '[PREFETCH_REC] async failed'
      );
    }, 0);
  }

  maybePrefetchFromPlayback({ currentStopIndex, enqueueSegment, ensureTtsRunning }) {
    if (!this._canAutoAdvance()) return;
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
      this._observeAsyncPrefetch(
        () => this.prefetchStopTextToQueue({ stopIndex: nextIndex, tail, epoch, enqueueSegment, ensureTtsRunning }),
        '[PREFETCH] async failed'
      );
    }, 0);
  }

  maybePrefetchFromRecordingPlayback({ recordingId, currentStopIndex, enqueueAudioSegment, ensureTtsRunning }) {
    const rid = String(recordingId || '').trim() || String(this._getPlaybackRecordingId() || '').trim();
    if (!rid) return;
    if (!this._canAutoAdvance({ allowPlaybackRecording: true })) return;
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
      this._observeAsyncPrefetch(
        () =>
          this.prefetchStopFromRecordingToQueue({
            recordingId: rid,
            stopIndex: nextIndex,
            epoch,
            enqueueAudioSegment,
            ensureTtsRunning,
          }),
        '[PREFETCH_REC] async failed'
      );
    }, 0);
  }

  async prefetchStopTextToQueue({ stopIndex, tail, epoch, enqueueSegment, ensureTtsRunning, force } = {}) {
    const idx = Number.isFinite(stopIndex) ? Number(stopIndex) : 0;
    const stops = Array.isArray(this._getStops()) ? this._getStops() : [];
    if (!stops.length || idx < 0 || idx >= stops.length) return;
    if (!this._canAutoAdvance()) return;
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
      const resp = await this._ragflowChunkManager.fetchAskStream({
        baseUrl: this._baseUrl,
        requestId: prefetchAskId,
        clientId: this._getClientId(),
        recordingId,
        signal: ctl.signal,
        payload: {
          question: prompt,
          request_id: prefetchAskId,
          client_id: this._getClientId(),
          kind: 'ask_prefetch',
          recording_id: recordingId || null,
          conversation_name: conv.useAgentMode ? null : conv.selectedChat,
          agent_id: conv.useAgentMode ? conv.selectedAgentId || null : null,
          guide: {
            enabled: !!this._getGuideEnabled(),
            duration_s: requirePositiveNumber(this._getGuideDuration(), 'guide_duration_required'),
            continuous: true,
            style: String(this._getGuideStyle() || 'friendly'),
            audience_profile: String(this._getAudienceProfile() || ''),
            stop_index: idx,
            stop_name: this._getStopName(idx),
            tour_action: 'next',
            action_type: '切站',
          },
        },
      });

      if (!resp.ok || !resp.body) throw new Error(`prefetch /api/ask http=${resp.status}`);

      let answerText = '';
      let gotAnySegment = false;
      const segments = [];

      await this._ragflowChunkManager.readSseStream(resp, {
        onEvent: async (data) => {
          if (ctl.signal.aborted) return false;
          if (!this._canAutoAdvance()) return false;
          if ((!force && !this._active) || !this._isInterruptEpochCurrent(epoch)) return false;
          if (data && data.chunk && !data.done) {
            answerText += String(data.chunk || '');
          }
          if (data && data.segment && !data.done) {
            const seg = String(data.segment || '').trim();
            if (seg) {
              gotAnySegment = true;
              segments.push(seg);
              if (!this._isInterruptEpochCurrent(epoch)) return false;
              if (enqueueSegment) enqueueSegment(seg, { stopIndex: idx, source: 'prefetch' });
              if (!this._isInterruptEpochCurrent(epoch)) return false;
              if (ensureTtsRunning) ensureTtsRunning();
            }
          }
          return true;
        },
      });

      if (ctl.signal.aborted) return;
      if (!this._canAutoAdvance()) return;
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
            this._observeAsyncPrefetch(
              () =>
                this.prefetchStopTextToQueue({
                  stopIndex: nextIndex,
                  tail: tailOut,
                  epoch,
                  enqueueSegment,
                  ensureTtsRunning,
                  force,
                }),
              '[PREFETCH] async failed'
            );
          }, 0);
        }
      }
    } catch (e) {
      if (ctl.signal.aborted || String(e && e.name) === 'AbortError') return;
      this._warn('[PREFETCH] failed', e);
      throw e;
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
    if (!this._canAutoAdvance({ allowPlaybackRecording: true })) return;
    if (!this._active) return;
    if (!this._isInterruptEpochCurrent(epoch)) return;
    if (this._prefetchStore.has(idx)) return;

    this.abortPrefetch('replace');
    const ctl = new AbortController();
    this._prefetchAbort = ctl;

    const url = this._url(`/api/recordings/${encodeURIComponent(rid)}/stop/${encodeURIComponent(String(idx))}`);
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

      if (enqueueAudioSegment && audioSegments.length) {
        for (const s of audioSegments) {
          const u = s && s.audio_url ? String(s.audio_url || '').trim() : '';
          const t = s && s.text ? String(s.text || '') : '';
          if (!u) continue;
          enqueueAudioSegment(u, { stopIndex: idx, text: t, source: 'prefetch_rec' });
          if (ensureTtsRunning) ensureTtsRunning();
        }
      }

      this._prefetchStore.set(idx, { answerText, tail: tailOut, createdAt: Date.now(), audioSegments });
      this._log('[PREFETCH_REC] ready', `stopIndex=${idx}`, `segments=${audioSegments.length}`);

      // Chain within the same prefetch window.
      const cur = this.getCurrentStopIndex();
      const nextIndex = idx + 1;
      if (nextIndex < stops.length) {
        const base = cur >= 0 ? cur : idx;
        if (nextIndex <= base + this._maxPrefetchAhead && !this._prefetchStore.has(nextIndex)) {
          setTimeout(() => {
            this._observeAsyncPrefetch(
              () =>
                this.prefetchStopFromRecordingToQueue({
                  recordingId: rid,
                  stopIndex: nextIndex,
                  epoch,
                  enqueueAudioSegment,
                  ensureTtsRunning,
                }),
              '[PREFETCH_REC] async failed'
            );
          }, 0);
        }
      }
    } catch (e) {
      if (ctl.signal.aborted || String(e && e.name) === 'AbortError') return;
      this._warn('[PREFETCH_REC] failed', e);
      throw e;
    } finally {
      if (this._prefetchAbort === ctl) this._prefetchAbort = null;
    }
  }
}

