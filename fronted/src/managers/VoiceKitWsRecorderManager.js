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
    continuous = false,
    label,
    startPayload,
    onStateChange,
    onPartialText,
    onFinalText,
    onEvent,
    onError,
    onLog,
  } = {}) {
    this._baseUrl = safeTrim(baseUrl || 'http://localhost:8000');
    this._label = safeTrim(label);
    this._clientId = safeTrim(clientId);
    this._requestId = safeTrim(requestId);
    this._targetSampleRate = Number(sampleRate) || 16000;
    this._continuous = !!continuous;
    this._startPayload = startPayload && typeof startPayload === 'object' ? startPayload : null;
    this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
    this._onPartialText = typeof onPartialText === 'function' ? onPartialText : null;
    this._onFinalText = typeof onFinalText === 'function' ? onFinalText : null;
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._onError = typeof onError === 'function' ? onError : null;
    this._log = typeof onLog === 'function' ? onLog : null;

    this._mgr = null;
    this._recorder = null;
    this._wsReady = false;
    this._frameQueue = [];
    this._isRecording = false;
    this._stopping = false;
    this._finalReceived = false;
    this._stopGraceTimer = null;
    this._stopGraceMs = 220;
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
    this._stopping = false;
    this._finalReceived = false;
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
    if (this.isRecording) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this._fail('Browser does not support getUserMedia');
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      this._fail('Browser security restriction: microphone requires https or localhost');
      return;
    }

    this._cleanup();
    this._disposeWs();
    this._setRecording(true);

    const wakeEnabled = !!(this._startPayload && this._startPayload.wake_word_enabled);
    const wakeWord = wakeEnabled ? safeTrim(this._startPayload && this._startPayload.wake_word) : '';
    const wakeWords = wakeEnabled ? parseWakeWords(wakeWord) : [];
    const wakeMatchMode = safeTrim(this._startPayload && this._startPayload.wake_match_mode) || 'contains';
    const strict = wakeMatchMode === 'prefix';
    const cooldownMs = Number(this._startPayload && this._startPayload.wake_cooldown_ms) || 0;
    const wakeMaxPos = Number(this._startPayload && this._startPayload.wake_max_pos) || (strict ? 0 : 2);

    const sessionId = this._requestId || `asrws_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
        if (this._onPartialText) this._onPartialText(text, msg);
      },
      onFinal: (text, msg) => {
        if (this._onEvent && msg) this._onEvent(msg);
        if (this._onFinalText) this._onFinalText(text, msg);
        this._finalReceived = true;
        if (this._stopping && !this._continuous) {
          this._disposeWs();
        }
      },
      onError: (e, msg) => {
        if (!this._stopping) this._fail(String(e || 'ws_error'), msg);
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

    this._wsReady = true;
    if (this._frameQueue.length) {
      const q = this._frameQueue;
      this._frameQueue = [];
      for (const b of q) mgr.sendAudioFrame(b);
    }
  }

  stop() {
    if (!this._mgr || !this._recorder) return;
    if (this._stopping) return;
    this._stopping = true;

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
      try {
        if (this._mgr) this._mgr.stopHoldToTalk();
      } catch (_) {
        // ignore
      }
      this._wsReady = false;
      this._frameQueue = [];
      this._stopMicOnly();
      this._setRecording(false);
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
