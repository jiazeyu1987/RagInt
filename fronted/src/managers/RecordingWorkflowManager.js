import { VoiceKitWsRecorderManager } from './VoiceKitWsRecorderManager';
import { AsrRecognitionSession } from '../voice/AsrRecognitionSession';

function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

export class RecordingWorkflowManager {
  constructor({ onLog } = {}) {
    this._log = typeof onLog === 'function' ? onLog : null;

    this._deps = {};
    this._recordPointerId = null;
    this._wsBaseText = '';
    this._lastAppliedInputText = '';
    this._wsRequireWake = false;
    this._wsAwakened = true;
    this._wsConfigSig = '';
    this._wsRequireWakeActive = false;
    this._wakeHoldMs = 8000;
    this._wakeHoldUntilMs = 0;

    this._recorder = null;
    this._pendingFinalText = [];
    this._pendingStopTimer = null;
    this._recordStartedAtMs = 0;
    this._session = new AsrRecognitionSession();
  }

  setDeps(next = {}) {
    const prevSig = this._wsConfigSig;
    this._deps = { ...(this._deps || {}), ...(next || {}) };
    this._wsRequireWake = !!this._deps.wsRequireWake;

    // Recreate recorder if wake config changed (recorder captures startPayload at construction).
    const sig = JSON.stringify({
      wsRequireWake: !!this._wsRequireWake,
      wakeWord: safeTrim(this._deps.wakeWord),
      wakeWordStrict: !!this._deps.wakeWordStrict,
      wakeWordCooldownMs: Number(this._deps.wakeWordCooldownMs) || 0,
      wakeHoldMs: Number(this._deps.wakeHoldMs) || 0,
      baseUrl: safeTrim(this._deps.baseUrl),
      clientId: safeTrim(this._deps.clientId),
    });
    this._wsConfigSig = sig;
    if (prevSig && sig !== prevSig && this._recorder) {
      try {
        this._recorder.cancel();
      } catch (_) {
        // ignore
      }
      this._recorder = null;
    }
  }

  get isRecording() {
    return !!(this._recorder && this._recorder.isRecording);
  }

  _setLoading(v) {
    const setIsLoading = this._deps.setIsLoading;
    if (typeof setIsLoading !== 'function') return;
    try {
      setIsLoading(!!v);
    } catch (_) {
      // ignore
    }
  }

  _setRecording(v) {
    const onRecordingChange = this._deps.onRecordingChange;
    if (typeof onRecordingChange !== 'function') return;
    try {
      onRecordingChange(!!v);
    } catch (_) {
      // ignore
    }
  }

  _setRecognizing(v) {
    const onRecognizingChange = this._deps.onRecognizingChange;
    if (typeof onRecognizingChange !== 'function') return;
    try {
      onRecognizingChange(!!v);
    } catch (_) {
      // ignore
    }
  }

  _setAsrStage(stage, extra = null) {
    const onAsrStageChange = this._deps.onAsrStageChange;
    if (typeof onAsrStageChange !== 'function') return;
    try {
      onAsrStageChange(String(stage || 'idle').trim() || 'idle', extra);
    } catch (_) {
      // ignore
    }
  }

  _appendOrReplaceInputText(nextText) {
    const setInputText = this._deps.setInputText;
    if (typeof setInputText !== 'function') return;
    const t = safeTrim(nextText);
    if (!t) return;
    try {
      setInputText(t);
      this._session.setLastAppliedInputText(t);
    } catch (_) {
      // ignore
    }
  }

  _replaceInputText(nextText) {
    const setInputText = this._deps.setInputText;
    if (typeof setInputText !== 'function') return;
    const t = safeTrim(nextText);
    try {
      setInputText(t);
      this._session.setLastAppliedInputText(t);
    } catch (_) {
      // ignore
    }
  }

  _getFinalTimeoutStrategy() {
    const strategy = safeTrim(this._deps.asrFinalTimeoutStrategy).toLowerCase();
    if (strategy === 'keep_input' || strategy === 'clear_input') return strategy;
    return 'keep_partial';
  }

  _handleFinalTimeout(partialText) {
    const partial = this._session.resolveTimeoutText(partialText);
    const strategy = this._getFinalTimeoutStrategy();

    this._setLoading(false);
    this._setRecognizing(false);
    this._setAsrStage('final_timeout', { strategy, text: partial });

    if (strategy === 'clear_input') {
      this._replaceInputText(this._session.getBaseText());
      this._emitFinalText('');
      return;
    }

    if (strategy === 'keep_partial' && partial) {
      this._appendOrReplaceInputText(this._composeLiveInputText(partial));
      this._emitFinalText(partial);
      return;
    }

    this._emitFinalText('');
  }

  _emitFinalText(text) {
    const t = safeTrim(text);
    const resolvers = this._pendingFinalText.splice(0, this._pendingFinalText.length);
    for (const r of resolvers) {
      try {
        r(t);
      } catch (_) {
        // ignore
      }
    }
    const onFinalText = this._deps.onFinalText;
    if (typeof onFinalText === 'function') {
      try {
        onFinalText(t);
      } catch (_) {
        // ignore
      }
    }
  }

  _clearPendingStopTimer() {
    if (!this._pendingStopTimer) return;
    try {
      clearTimeout(this._pendingStopTimer);
    } catch (_) {
      // ignore
    }
    this._pendingStopTimer = null;
  }

  _stopRecorderNow() {
    this._clearPendingStopTimer();
    if (!this._recorder) return;
    try {
      this._recorder.stop();
    } catch (_) {
      // ignore
    }
    this._recordStartedAtMs = 0;
  }

  _snapshotBaseText() {
    const getInputText = this._deps.getInputText;
    if (typeof getInputText !== 'function') {
      this._wsBaseText = '';
      this._session.reset('');
      return;
    }
    try {
      this._wsBaseText = safeTrim(getInputText());
    } catch (_) {
      this._wsBaseText = '';
    }
    this._session.reset(this._wsBaseText);
  }

  _composeLiveInputText(asrText) {
    const recognizedText = safeTrim(asrText);
    if (!recognizedText) return '';

    const getInputText = this._deps.getInputText;
    let currentInput = '';
    if (typeof getInputText === 'function') {
      try {
        currentInput = safeTrim(getInputText());
      } catch (_) {
        currentInput = '';
      }
    }
    return this._session.composeInputText(recognizedText, currentInput);
  }

  _ensureRecorder() {
    const baseUrl = this._deps.baseUrl;
    const clientId = safeTrim(this._deps.clientId);
    const wakeWord = safeTrim(this._deps.wakeWord);
    const strict = !!this._deps.wakeWordStrict;
    const wakeMatchMode = strict ? 'prefix' : 'contains';
    const wakeCooldownMs = Number(this._deps.wakeWordCooldownMs) || 0;

    if (this._recorder) return;

    const holdActive = Date.now() < (Number(this._wakeHoldUntilMs) || 0);
    const requireWake = !!this._wsRequireWake && !!wakeWord && !holdActive;

    this._recorder = new VoiceKitWsRecorderManager({
      baseUrl,
      label: 'rec',
      clientId,
      requestId: `asrws_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      sampleRate: 16000,
      stopGraceMs: Number(this._deps.asrStopGraceMs) || 480,
      finalWaitMs: Number(this._deps.asrFinalWaitMs) || 1500,
      startPayload: requireWake
        ? {
            wake_word_enabled: true,
            wake_word: wakeWord,
            wake_match_mode: wakeMatchMode,
            wake_cooldown_ms: wakeCooldownMs,
            // Non-strict mode: allow a little leading filler like "嗯" before wake word.
            // Strict mode: require wake word at the beginning.
            wake_max_pos: strict ? 0 : 2,
            emit_prewake: false,
          }
        : null,
      onEvent: (evt) => {
        const t = safeTrim(evt && evt.type).toLowerCase();
        if (t === 'wake') this._setAsrStage('wake_detected', evt);
        else if (t === 'info') this._setAsrStage('streaming', evt);

        if (requireWake && t === 'wake') {
          this._wsAwakened = true;
          this._wakeHoldUntilMs = Date.now() + this._wakeHoldMs;
          if (this._log) this._log('[REC] wake', { wakeWord });
          const onWakeWordFeedback = this._deps.onWakeWordFeedback;
          if (typeof onWakeWordFeedback === 'function') {
            try {
              onWakeWordFeedback({ message: '已唤醒' });
            } catch (_) {
              // ignore
            }
          }
          return;
        }
        if (requireWake && t === 'info') {
          const m = safeTrim(evt && evt.message);
          const onWakeWordFeedback = this._deps.onWakeWordFeedback;
          if (m && typeof onWakeWordFeedback === 'function') {
            try {
              onWakeWordFeedback({ message: m });
            } catch (_) {
              // ignore
            }
          }
        }
      },
      onStateChange: (v) => this._setRecording(!!v),
      onRecognizingChange: (v) => this._setRecognizing(!!v),
      onPartialText: (text) => {
        if (requireWake && !this._wsAwakened) return;
        const t = safeTrim(text);
        if (!t) return;
        const update = this._session.applyPartial(t);
        this._setAsrStage('receiving_partial', {
          text: update.sourceText,
          assembledText: update.assembledText,
          committedText: update.committedText,
          hypothesisText: update.hypothesisText,
        });
        if (this._wsRequireWake && wakeWord) this._wakeHoldUntilMs = Date.now() + this._wakeHoldMs;
        this._appendOrReplaceInputText(this._composeLiveInputText(update.assembledText || update.sourceText));
      },
      onFinalText: (text) => {
        if (requireWake && !this._wsAwakened) {
          this._setLoading(false);
          this._setRecognizing(false);
          this._setAsrStage('idle');
          this._emitFinalText('');
          return;
        }
        const t = safeTrim(text);
        const update = this._session.applyFinal(t);
        if (update.assembledText || t) this._appendOrReplaceInputText(this._composeLiveInputText(update.assembledText || t));
        if (t && this._wsRequireWake && wakeWord) this._wakeHoldUntilMs = Date.now() + this._wakeHoldMs;
        this._setLoading(false);
        this._setRecognizing(false);
        this._setAsrStage('final_received', {
          text: update.sourceText,
          assembledText: update.assembledText,
          committedText: update.committedText,
        });
        this._emitFinalText(update.assembledText || t);
      },
      onFinalTimeout: (text) => {
        this._handleFinalTimeout(text);
      },
      onError: (msg) => {
        this._setLoading(false);
        this._setRecognizing(false);
        this._setAsrStage('error', { message: safeTrim(msg) });
        if (this._log) this._log('[REC] ws error', msg);
        const onWakeWordFeedback = this._deps.onWakeWordFeedback;
        if (requireWake && typeof onWakeWordFeedback === 'function') {
          try {
            onWakeWordFeedback({ message: `ASR 错误：${safeTrim(msg)}` });
          } catch (_) {
            // ignore
          }
        }
        this._emitFinalText('');
      },
      onLog: (...args) => (this._log ? this._log(...args) : null),
    });
  }

  async start() {
    // For VoiceKit WS, startPayload/gating decisions are captured at construction time.
    // Recreate per session so wake-hold state is applied immediately on the next press.
    if (this._recorder) {
      try {
        this._recorder.cancel();
      } catch (_) {
        // ignore
      }
      this._recorder = null;
    }

    this._ensureRecorder();
    if (!this._recorder) return;

    const unlockAudio = this._deps.unlockAudio;
    try {
      if (typeof unlockAudio === 'function') unlockAudio();
    } catch (_) {
      // ignore
    }

    this._snapshotBaseText();
    this._setLoading(true);
    this._setRecognizing(true);
    this._setAsrStage('capturing');
    this._clearPendingStopTimer();
    this._recordStartedAtMs = Date.now();
    this._wsRequireWakeActive = !!this._wsRequireWake && !!safeTrim(this._deps.wakeWord);
    const holdActive = Date.now() < (Number(this._wakeHoldUntilMs) || 0);
    this._wsAwakened = holdActive ? true : !this._wsRequireWakeActive;
    this._wakeHoldMs = Math.max(500, Math.min(120000, Math.round(Number(this._deps.wakeHoldMs) || 8000)));

    try {
      await this._recorder.start();
    } catch (e) {
      this._setLoading(false);
      this._setRecognizing(false);
      this._setAsrStage('error', { message: safeTrim(e && e.message ? e.message : e) });
      if (this._log) this._log('[REC] start failed', e);
    }
  }

  stop() {
    if (!this._recorder) return;

    const ttsEnabledRef = this._deps.ttsEnabledRef;
    const audioContextRef = this._deps.audioContextRef;
    const unlockAudio = this._deps.unlockAudio;
    const onWakeWordFeedback = this._deps.onWakeWordFeedback;

    if (ttsEnabledRef && ttsEnabledRef.current) {
      if (audioContextRef && audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
      try {
        if (typeof unlockAudio === 'function') unlockAudio();
      } catch (_) {
        // ignore
      }
    }

    const minRecordMs = Math.max(0, Math.round(Number(this._deps.minRecordMs) || 0));
    const elapsedMs = this._recordStartedAtMs > 0 ? Date.now() - this._recordStartedAtMs : minRecordMs;
    const remainingMs = Math.max(0, minRecordMs - elapsedMs);
    if (remainingMs > 0) {
      this._setAsrStage('waiting_min_duration', { remainingMs });
      this._clearPendingStopTimer();
      this._pendingStopTimer = setTimeout(() => {
        this._pendingStopTimer = null;
        this._setAsrStage('awaiting_final');
        this._stopRecorderNow();
      }, remainingMs);
    } else {
      this._setAsrStage('awaiting_final');
      this._stopRecorderNow();
    }

    if (this._wsRequireWakeActive && !this._wsAwakened && typeof onWakeWordFeedback === 'function') {
      try {
        onWakeWordFeedback({ message: '未检测到唤醒词' });
      } catch (_) {
        // ignore
      }
    }
  }

  async recordOnce({ maxRecordMs = 3500, totalTimeoutMs = 12000 } = {}) {
    if (this.isRecording) return '';
    const maxMs = Math.max(500, Number(maxRecordMs) || 3500);
    const totalMs = Math.max(maxMs + 500, Number(totalTimeoutMs) || 12000);

    let stopTimer = null;
    let timeoutTimer = null;
    try {
      const p = new Promise((resolve) => {
        this._pendingFinalText.push(resolve);
        timeoutTimer = setTimeout(() => resolve(''), totalMs);
      });

      await this.start();
      stopTimer = setTimeout(() => {
        try {
          this.stop();
        } catch (_) {
          // ignore
        }
      }, maxMs);

      const text = await p;
      return safeTrim(text);
    } finally {
      if (stopTimer) clearTimeout(stopTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }
  }

  cancel() {
    this._clearPendingStopTimer();
    try {
      if (this._recorder && this._recorder.isRecording) this._recorder.cancel();
    } catch (_) {
      // ignore
    }
    this._recordStartedAtMs = 0;
    this._setLoading(false);
    this._setRecognizing(false);
    this._setAsrStage('idle');
  }

  async onPointerDown(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {
      // ignore
    }
    if (this._recordPointerId != null) return;
    this._recordPointerId = e && e.pointerId != null ? e.pointerId : 'mouse';
    if (this._log) this._log('[REC] pointerdown', this._recordPointerId);
    try {
      if (e && e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function' && e.pointerId != null) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    } catch (_) {
      // ignore
    }
    await this.start();
  }

  onPointerUp(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {
      // ignore
    }
    const pid = e && e.pointerId != null ? e.pointerId : 'mouse';
    if (this._recordPointerId != null && this._recordPointerId !== pid) return;
    if (this._log) this._log('[REC] pointerup', pid);
    this._recordPointerId = null;
    this.stop();
  }

  onPointerCancel() {
    if (this._log) this._log('[REC] pointercancel');
    if (this._recordPointerId == null) return;
    this._recordPointerId = null;
    this.stop();
  }
}

