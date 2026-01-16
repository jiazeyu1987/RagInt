import { VOICE_DEBUG } from '../config/features';

export class PcmWsRecorderManager {
  constructor({
    wsUrl,
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
    this._wsUrl = String(wsUrl || '');
    this._label = String(label || '');
    this._clientId = String(clientId || '');
    this._requestId = String(requestId || '');
    this._targetSampleRate = Number(sampleRate) || 16000;
    this._continuous = !!continuous;
    this._startPayload = startPayload && typeof startPayload === 'object' ? startPayload : null;
    this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
    this._onPartialText = typeof onPartialText === 'function' ? onPartialText : null;
    this._onFinalText = typeof onFinalText === 'function' ? onFinalText : null;
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._onError = typeof onError === 'function' ? onError : null;
    this._log = typeof onLog === 'function' ? onLog : null;

    this._stream = null;
    this._audioContext = null;
    this._sourceNode = null;
    this._processorNode = null;
    this._ws = null;
    this._isRecording = false;
    this._stopping = false;
    this._connecting = false;
    this._sentBytes = 0;
    this._lastStatsMs = 0;
    this._sessionId = 0;
    this._stopTimer = null;
    this._finalReceived = false;
  }

  _stopCapture() {
    try {
      if (this._processorNode) this._processorNode.disconnect();
    } catch (_) {
      // ignore
    }
    try {
      if (this._sourceNode) this._sourceNode.disconnect();
    } catch (_) {
      // ignore
    }
    this._processorNode = null;
    this._sourceNode = null;

    const ac = this._audioContext;
    this._audioContext = null;
    try {
      if (ac) ac.close();
    } catch (_) {
      // ignore
    }

    const s = this._stream;
    this._stream = null;
    try {
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch (_) {
      // ignore
    }
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

  _downsampleTo16kMono(float32, srcRate, dstRate) {
    const rate = Number(srcRate) || 48000;
    const target = Number(dstRate) || 16000;
    if (rate === target) return float32;
    const ratio = rate / target;
    const newLen = Math.max(1, Math.round(float32.length / ratio));
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const pos = i * ratio;
      const left = Math.floor(pos);
      const right = Math.min(float32.length - 1, left + 1);
      const w = pos - left;
      out[i] = float32[left] * (1 - w) + float32[right] * w;
    }
    return out;
  }

  _rmsAndPeak(float32) {
    if (!float32 || !float32.length) return { rms: 0, peak: 0 };
    let sum2 = 0;
    let peak = 0;
    for (let i = 0; i < float32.length; i++) {
      const v = float32[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum2 += v * v;
    }
    const rms = Math.sqrt(sum2 / float32.length);
    return { rms, peak };
  }

  _floatToInt16Bytes(float32) {
    const buf = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < float32.length; i++) {
      let s = float32[i];
      if (s > 1) s = 1;
      if (s < -1) s = -1;
      view.setInt16(i * 2, Math.round(s * 32767), true);
    }
    return buf;
  }

  async start() {
    if (this._isRecording || this._connecting) return;
    // If a previous session didn't fully clean up (e.g. missing final), reset now.
    if (this._ws || this._stream || this._audioContext) {
      this._cleanup();
    }
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }
    if (!this._wsUrl) {
      this._fail('Missing wsUrl');
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this._fail('Browser does not support getUserMedia');
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      this._fail('Browser security restriction: microphone requires https or localhost');
      return;
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      this._fail('Failed to access microphone permission', err);
      return;
    }
    this._stream = stream;

    let ws = null;
    try {
      ws = new WebSocket(this._wsUrl);
      ws.binaryType = 'arraybuffer';
    } catch (err) {
      this._fail('Failed to create WebSocket', err);
      this._cleanup();
      return;
    }
    this._ws = ws;
    this._sentBytes = 0;
    this._lastStatsMs = Date.now();
    this._sessionId += 1;
    const sessionId = this._sessionId;
    this._finalReceived = false;
    const label =
      this._label ||
      (VOICE_DEBUG
        ? (() => {
            try {
              const u = new URL(this._wsUrl, window.location && window.location.href ? window.location.href : undefined);
              return String(u.searchParams.get('role') || '');
            } catch (_) {
              return '';
            }
          })()
        : '');
    const startStack =
      VOICE_DEBUG && this._log
        ? (() => {
            try {
              const s = new Error().stack || '';
              return s.split('\n').slice(0, 10).join('\n');
            } catch (_) {
              return '';
            }
          })()
        : '';

    ws.onmessage = (ev) => {
      try {
        const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
        if (!data) return;
        const t = String(data.type || '').toLowerCase();
        const text = data.text != null ? String(data.text) : '';
        if (this._log) this._log('[ASR-WS] recv', { label, sessionId, type: t, textLen: text.length, dt_ms: data.dt_ms });
        if (this._onEvent) this._onEvent(data);
        if (t === 'partial') {
          if (this._onPartialText) this._onPartialText(text, data);
        } else if (t === 'final') {
          this._finalReceived = true;
          if (this._onFinalText) this._onFinalText(text, data);
          if (!this._continuous) this._cleanup();
        } else if (t === 'error') {
          this._fail(`ASR ws error: ${String(data.error || data.message || 'unknown')}`);
        }
      } catch (_) {
        // ignore
      }
    };
    ws.onerror = () => {
      const st = ws ? ws.readyState : -1;
      // Browsers may surface protocol errors during/after a normal stop+final flow.
      // Don't treat it as a recording failure once we've already received `final` or stopped.
      if (this._stopping || this._finalReceived) {
        try {
          if (this._log) this._log('[ASR-WS] ws_error_ignored', { label, sessionId, state: st, stopping: this._stopping, final: this._finalReceived });
        } catch (_) {
          // ignore
        }
        this._cleanup();
        return;
      }
      this._fail(`WebSocket error (label=${label} session=${sessionId} state=${st})`);
      this._cleanup();
    };
    ws.onclose = (ev) => {
      try {
        if (this._log) {
          this._log('[ASR-WS] close', {
            label,
            sessionId,
            code: ev && ev.code,
            reason: ev && ev.reason,
            wasClean: ev && ev.wasClean,
          });
        }
      } catch (_) {
        // ignore
      }
    };

    this._connecting = true;
    await new Promise((resolve) => {
      ws.onopen = () => resolve();
      ws.onclose = () => resolve();
    });
    this._connecting = false;
    if (ws.readyState !== WebSocket.OPEN) {
      this._fail('WebSocket not open');
      this._cleanup();
      return;
    }
    if (this._log) this._log('[ASR-WS] open', { label, sessionId, wsUrl: this._wsUrl, stack: startStack });

    try {
      const startMsg = {
        type: 'start',
        request_id: this._requestId,
        client_id: this._clientId,
        sample_rate: this._targetSampleRate,
        encoding: 'pcm_s16le',
        continuous: !!this._continuous,
        ...(this._startPayload || {}),
      };
      if (this._log) this._log('[ASR-WS] send_start', { label, sessionId, ...startMsg });
      ws.send(JSON.stringify(startMsg));
    } catch (err) {
      this._fail('Failed to send start message', err);
      this._cleanup();
      return;
    }

    let audioContext = null;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      this._fail('Failed to create AudioContext', err);
      this._cleanup();
      return;
    }
    this._audioContext = audioContext;

    try {
      this._sourceNode = audioContext.createMediaStreamSource(stream);
      // ScriptProcessorNode is deprecated but widely supported; good enough for demo/booth.
      this._processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    } catch (err) {
      this._fail('Failed to create audio nodes', err);
      this._cleanup();
      return;
    }

    this._processorNode.onaudioprocess = (e) => {
      try {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
        if (this._stopping) return;

        const input = e.inputBuffer.getChannelData(0);
        const srcStats = this._rmsAndPeak(input);
        const down = this._downsampleTo16kMono(input, audioContext.sampleRate, this._targetSampleRate);
        const downStats = this._rmsAndPeak(down);
        const buf = this._floatToInt16Bytes(down);

        // Backpressure: avoid unbounded buffering in the browser.
        if (this._ws.bufferedAmount > 1024 * 1024) return;
        this._ws.send(buf);
        this._sentBytes += buf.byteLength || 0;

        const nowMs = Date.now();
        if (nowMs - this._lastStatsMs >= 1000) {
          this._lastStatsMs = nowMs;
          if (this._log) {
            this._log('[ASR-WS] send_stats', {
              label,
              sessionId,
              sentKB: Math.round(this._sentBytes / 1024),
              bufferedKB: Math.round((this._ws && this._ws.bufferedAmount ? this._ws.bufferedAmount : 0) / 1024),
              srcRate: audioContext.sampleRate,
              dstRate: this._targetSampleRate,
              srcRms: Number(srcStats.rms.toFixed(4)),
              srcPeak: Number(srcStats.peak.toFixed(4)),
              downRms: Number(downStats.rms.toFixed(4)),
              downPeak: Number(downStats.peak.toFixed(4)),
            });
          }
        }
      } catch (_) {
        // ignore
      }
    };

    try {
      this._sourceNode.connect(this._processorNode);
      this._processorNode.connect(audioContext.destination);
    } catch (_) {
      // ignore
    }

    this._stopping = false;
    this._setRecording(true);
  }

  stop() {
    if (!this._isRecording) return;
    this._setRecording(false);
    this._stopping = true;
    // Release microphone immediately; keep WS alive briefly to receive final text.
    this._stopCapture();
    try {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        if (this._log) this._log('[ASR-WS] send_stop', { label: this._label, sentKB: Math.round(this._sentBytes / 1024) });
        this._ws.send(JSON.stringify({ type: 'stop' }));
      }
    } catch (_) {
      // ignore
    }
    // Keep WS open briefly to receive final; cleanup on final or after timeout.
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }
    this._stopTimer = setTimeout(() => {
      this._stopTimer = null;
      if (this._log) this._log('[ASR-WS] stop_timeout_cleanup', { label: this._label, sentKB: Math.round(this._sentBytes / 1024) });
      this._cleanup();
    }, this._continuous ? 2000 : 8000);
  }

  cancel() {
    this._setRecording(false);
    this._stopping = true;
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }
    this._stopCapture();
    try {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        if (this._log) this._log('[ASR-WS] send_cancel', { sentKB: Math.round(this._sentBytes / 1024) });
        this._ws.send(JSON.stringify({ type: 'cancel' }));
      }
    } catch (_) {
      // ignore
    }
    this._cleanup();
  }

  _cleanup() {
    this._connecting = false;
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }
    this._stopCapture();

    const ws = this._ws;
    this._ws = null;
    try {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    } catch (_) {
      // ignore
    }
  }
}
