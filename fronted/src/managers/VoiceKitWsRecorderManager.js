import { createMicRecorder, createVoiceInputManager } from 'voicekit-js';

function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

function parseWakeWords(raw) {
  return String(raw == null ? '' : raw)
    .split(/[,\uFF0C;]/g)
    .map((s) => String(s == null ? '' : s).trim())
    .filter((s) => !!s);
}

function toInt(value, fallback, { min = null, max = null, name = 'value' } = {}) {
  const missing = value == null || (typeof value === 'string' && value.trim() === '');
  if (missing) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`invalid_voicekit_numeric_config:${name}`);
  const out = Math.round(n);
  if (Number.isFinite(min) && out < Number(min)) throw new Error(`invalid_voicekit_numeric_config:${name}`);
  if (Number.isFinite(max) && out > Number(max)) throw new Error(`invalid_voicekit_numeric_config:${name}`);
  return out;
}

function normalizeWakeConfig(startPayload) {
  const payload = startPayload && typeof startPayload === 'object' ? startPayload : null;
  const wakeEnabled = !!(payload && payload.wake_word_enabled);
  if (!wakeEnabled) {
    return {
      wakeEnabled: false,
      wakeWord: '',
      wakeWords: [],
      strict: false,
      cooldownMs: 0,
      wakeMaxPos: 2,
    };
  }

  const wakeWord = safeTrim(payload && payload.wake_word);
  const wakeWords = parseWakeWords(wakeWord);
  const wakeMatchMode = safeTrim(payload && payload.wake_match_mode) || 'contains';
  if (wakeMatchMode !== 'contains' && wakeMatchMode !== 'prefix') {
    throw new Error('invalid_voicekit_wake_match_mode');
  }
  const strict = wakeMatchMode === 'prefix';
  return {
    wakeEnabled,
    wakeWord,
    wakeWords,
    strict,
    cooldownMs: toInt(payload && payload.wake_cooldown_ms, 0, {
      min: 0,
      max: 120000,
      name: 'wake_cooldown_ms',
    }),
    wakeMaxPos: toInt(payload && payload.wake_max_pos, strict ? 0 : 2, {
      min: 0,
      max: 20,
      name: 'wake_max_pos',
    }),
  };
}

export class VoiceKitWsRecorderManager {
  constructor({
    baseUrl,
    clientId,
    requestId,
    sampleRate = 16000,
    stopGraceMs = 480,
    finalWaitMs = 1500,
    continuous = false,
    label,
    startPayload,
    onStateChange,
    onRecognizingChange,
    onPartialText,
    onFinalText,
    onFinalTimeout,
    onEvent,
    onError,
    onLog,
  } = {}) {
    this._baseUrl = safeTrim(baseUrl || '');
    this._label = safeTrim(label);
    this._clientId = safeTrim(clientId);
    this._requestId = safeTrim(requestId);
    this._targetSampleRate = toInt(sampleRate, 16000, { min: 8000, max: 48000, name: 'sampleRate' });
    this._continuous = !!continuous;
    this._startPayload = startPayload && typeof startPayload === 'object' ? startPayload : null;
    this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
    this._onRecognizingChange = typeof onRecognizingChange === 'function' ? onRecognizingChange : null;
    this._onPartialText = typeof onPartialText === 'function' ? onPartialText : null;
    this._onFinalText = typeof onFinalText === 'function' ? onFinalText : null;
    this._onFinalTimeout = typeof onFinalTimeout === 'function' ? onFinalTimeout : null;
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._onError = typeof onError === 'function' ? onError : null;
    this._log = typeof onLog === 'function' ? onLog : null;

    this._mgr = null;
    this._recorder = null;
    this._wsReady = false;
    this._frameQueue = [];
    this._isRecording = false;
    this._stopRequested = false;
    this._stopping = false;
    this._finalReceived = false;
    this._isRecognizing = false;
    this._stopGraceTimer = null;
    this._finalWaitTimer = null;
    this._stopGraceMs = toInt(stopGraceMs, 480, { min: 0, max: 5000, name: 'stopGraceMs' });
    this._finalWaitMs = toInt(finalWaitMs, 1500, { min: 200, max: 30000, name: 'finalWaitMs' });
    this._lastPartialText = '';
  }

  get isRecording() {
    return !!this._isRecording;
  }

  _setRecording(next) {
    this._isRecording = !!next;
    if (this._onStateChange) {
      try {
        this._onStateChange(this._isRecording);
      } catch (_) {
        // ignore
      }
    }
  }

  _setRecognizing(next) {
    this._isRecognizing = !!next;
    if (this._onRecognizingChange) {
      try {
        this._onRecognizingChange(this._isRecognizing);
      } catch (_) {
        // ignore
      }
    }
  }

  _fail(msg, err) {
    if (this._log) this._log('[ASR-WS]', { label: this._label }, msg, err || '');
    if (this._onError) {
      try {
        this._onError(msg, err);
        return;
      } catch (_) {
        // ignore
      }
    }
    // eslint-disable-next-line no-console
    console.error(msg, err);
  }

  _cleanup() {
    this._wsReady = false;
    this._frameQueue = [];
    if (this._stopGraceTimer) {
      try {
        clearTimeout(this._stopGraceTimer);
      } catch (_) {
        // ignore
      }
      this._stopGraceTimer = null;
    }
    if (this._finalWaitTimer) {
      try {
        clearTimeout(this._finalWaitTimer);
      } catch (_) {
        // ignore
      }
      this._finalWaitTimer = null;
    }
    this._stopRequested = false;
    this._stopping = false;
    this._finalReceived = false;
    this._lastPartialText = '';
    this._setRecognizing(false);
    this._setRecording(false);
  }

  _stopMicOnly() {
    try {
      if (this._recorder) this._recorder.stop();
    } catch (_) {
      // ignore
    }
    this._recorder = null;
  }

  _disposeWs() {
    try {
      if (this._mgr) this._mgr.dispose();
    } catch (_) {
      // ignore
    }
    this._mgr = null;
  }

  async start() {
    if (this.isRecording) return true;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this._fail('Browser does not support getUserMedia');
      return false;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      this._fail('Browser security restriction: microphone requires https or localhost');
      return false;
    }

    let wakeConfig = null;
    try {
      wakeConfig = normalizeWakeConfig(this._startPayload);
    } catch (e) {
      this._fail('Failed to start VoiceKit ASR', e);
      throw e;
    }

    this._cleanup();
    this._disposeWs();
    this._setRecognizing(true);
    this._setRecording(true);

    const { wakeEnabled, wakeWord, wakeWords, strict, cooldownMs, wakeMaxPos } = wakeConfig;

    const sessionId = this._requestId || `asrws_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    let startupError = '';
    let startupPhase = true;
    const mgr = createVoiceInputManager({
      baseUrl: this._baseUrl,
      clientId: this._clientId,
      onStatus: (m) => {
        if (!m) return;
        if (this._onEvent) this._onEvent({ type: 'info', message: String(m), request_id: sessionId });
      },
      onWake: (msg) => {
        if (this._onEvent) this._onEvent(msg);
      },
      onPartial: (text, msg) => {
        if (this._onEvent && msg) this._onEvent(msg);
        this._lastPartialText = safeTrim(text);
        if (this._onPartialText) this._onPartialText(text, msg);
      },
      onFinal: (text, msg) => {
        if (this._onEvent && msg) this._onEvent(msg);
        this._lastPartialText = safeTrim(text);
        if (this._onFinalText) this._onFinalText(text, msg);
        this._finalReceived = true;
        this._setRecognizing(false);
        if (this._stopping && !this._continuous) {
          if (this._finalWaitTimer) {
            try {
              clearTimeout(this._finalWaitTimer);
            } catch (_) {
              // ignore
            }
            this._finalWaitTimer = null;
          }
          this._disposeWs();
          this._setRecording(false);
        }
      },
      onError: (e, msg) => {
        const errText = safeTrim(e || 'ws_error') || 'ws_error';
        if (startupPhase && !startupError) startupError = errText;
        this._setRecognizing(false);
        if (!this._stopRequested && !this._stopping) this._fail(errText, msg);
      },
    });
    this._mgr = mgr;

    this._wsReady = false;
    this._frameQueue = [];
    this._recorder = createMicRecorder({
      dstSampleRate: this._targetSampleRate,
      chunkMs: 20,
      onFrame: (buf) => {
        if (!this._mgr || this._stopping) return;
        if (!(buf instanceof ArrayBuffer)) return;
        if (!this._wsReady) {
          this._frameQueue.push(buf);
          if (this._frameQueue.length > 25) this._frameQueue.shift();
          return;
        }
        this._mgr.sendAudioFrame(buf);
      },
      onError: (e) => this._fail('Failed to access microphone', e),
    });

    try {
      // Important: start mic FIRST (user gesture handler), then await WS connect/start.
      await this._recorder.start();

      await mgr.startHoldToTalk({
        wakeEnabled,
        wakeWords,
        wakeWord,
        strict,
        cooldownMs,
        wakeMaxPos,
      });

      startupPhase = false;
      if (startupError) throw new Error(startupError);

      this._wsReady = true;
      if (this._frameQueue.length) {
        const q = this._frameQueue;
        this._frameQueue = [];
        for (const b of q) mgr.sendAudioFrame(b);
      }
      return true;
    } catch (e) {
      startupPhase = false;
      this._stopMicOnly();
      this._disposeWs();
      const stoppedBeforeReady = !!(this._stopRequested || this._stopping);
      this._cleanup();
      if (stoppedBeforeReady) return false;
      this._fail('Failed to start VoiceKit ASR', e);
      return false;
    }
  }

  stop() {
    if (!this._mgr || !this._recorder) return;
    if (this._stopRequested || this._stopping) return;
    this._stopRequested = true;

    // Stop grace: keep sending a tiny tail to reduce "release too fast -> missing last syllables".
    if (this._stopGraceTimer) {
      try {
        clearTimeout(this._stopGraceTimer);
      } catch (_) {
        // ignore
      }
      this._stopGraceTimer = null;
    }
    this._stopGraceTimer = setTimeout(() => {
      this._stopGraceTimer = null;
      this._stopping = true;
      let stopFailed = false;
      try {
        if (this._mgr) this._mgr.stopHoldToTalk();
      } catch (e) {
        stopFailed = true;
        this._fail('voicekit_stop_hold_to_talk_failed', e);
      }
      this._wsReady = false;
      this._frameQueue = [];
      this._stopMicOnly();
      this._disposeWs();
      if (stopFailed) {
        this._setRecognizing(false);
        this._setRecording(false);
        return;
      }
      if (this._finalReceived || this._continuous) {
        this._setRecognizing(false);
        this._setRecording(false);
        return;
      }
      if (this._finalWaitTimer) {
        try {
          clearTimeout(this._finalWaitTimer);
        } catch (_) {
          // ignore
        }
      }
      this._finalWaitTimer = setTimeout(() => {
        this._finalWaitTimer = null;
        const timeoutInfo = { reason: 'final_wait_timeout' };
        this._fail('voicekit_final_wait_timeout', timeoutInfo);
        if (this._onFinalTimeout) {
          try {
            this._onFinalTimeout(this._lastPartialText, timeoutInfo);
          } catch (_) {
            // ignore
          }
        }
        this._disposeWs();
        this._setRecognizing(false);
        this._setRecording(false);
      }, this._finalWaitMs);
    }, this._stopGraceMs);
  }

  cancel() {
    try {
      if (this._mgr) this._mgr.cancel();
    } catch (_) {
      // ignore
    }
    this._disposeWs();
    this._stopMicOnly();
    this._cleanup();
  }
}
