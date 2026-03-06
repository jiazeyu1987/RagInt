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
    this._targetSampleRate = Number(sampleRate) || 16000;
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
    this._stopGraceMs = Math.max(0, Number(stopGraceMs) || 480);
    this._finalWaitMs = Math.max(200, Number(finalWaitMs) || 1500);
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

    this._cleanup();
    this._disposeWs();
    this._setRecognizing(true);
    this._setRecording(true);

    const wakeEnabled = !!(this._startPayload && this._startPayload.wake_word_enabled);
    const wakeWord = wakeEnabled ? safeTrim(this._startPayload && this._startPayload.wake_word) : '';
    const wakeWords = wakeEnabled ? parseWakeWords(wakeWord) : [];
    const wakeMatchMode = safeTrim(this._startPayload && this._startPayload.wake_match_mode) || 'contains';
    const strict = wakeMatchMode === 'prefix';
    const cooldownMs = Number(this._startPayload && this._startPayload.wake_cooldown_ms) || 0;
    const wakeMaxPos = Number(this._startPayload && this._startPayload.wake_max_pos) || (strict ? 0 : 2);

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
      try {
        if (this._mgr) this._mgr.stopHoldToTalk();
      } catch (_) {
        // ignore
      }
      this._wsReady = false;
      this._frameQueue = [];
      this._stopMicOnly();
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
        if (this._onFinalTimeout) {
          try {
            this._onFinalTimeout(this._lastPartialText, { reason: 'final_wait_timeout' });
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
