import { RecorderManager } from './RecorderManager';
import { PcmWsRecorderManager } from './PcmWsRecorderManager';

function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

function buildAsrHttpEndpoint(baseUrl) {
  const base = safeTrim(baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
  return `${base}/api/speech_to_text`;
}

function buildAsrWsUrl(baseUrl) {
  const base = safeTrim(baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
  const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsBase}/ws/asr`;
}

export class RecordingWorkflowManager {
  constructor({ onLog } = {}) {
    this._log = typeof onLog === 'function' ? onLog : null;

    this._deps = {};
    this._recordPointerId = null;
    this._asrAbort = null;
    this._wsBaseText = '';

    this._recorder = null;
    this._asrMode = 'http';
  }

  setDeps(next = {}) {
    this._deps = { ...(this._deps || {}), ...(next || {}) };
    this._asrMode = String(this._deps.asrMode || 'http');
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

  _appendOrReplaceInputText(nextText) {
    const setInputText = this._deps.setInputText;
    if (typeof setInputText !== 'function') return;
    const t = safeTrim(nextText);
    if (!t) return;
    try {
      setInputText(t);
    } catch (_) {
      // ignore
    }
  }

  _snapshotBaseText() {
    const getInputText = this._deps.getInputText;
    if (typeof getInputText !== 'function') {
      this._wsBaseText = '';
      return;
    }
    try {
      this._wsBaseText = safeTrim(getInputText());
    } catch (_) {
      this._wsBaseText = '';
    }
  }

  async _processAudioHttp(audioBlob, meta = {}) {
    const baseUrl = this._deps.baseUrl;
    const clientId = safeTrim(this._deps.clientId);
    const decodeAndConvertToWav16kMono = this._deps.decodeAndConvertToWav16kMono;
    const setInputText = this._deps.setInputText;

    const asrEndpoint = buildAsrHttpEndpoint(baseUrl);

    this._setLoading(true);
    try {
      let blobToSend = audioBlob;
      const ct = String(meta.mimeType || audioBlob.type || '').toLowerCase();

      if (ct.includes('webm') || ct.includes('ogg') || ct.includes('mp4')) {
        try {
          if (typeof decodeAndConvertToWav16kMono === 'function') {
            const wav = await decodeAndConvertToWav16kMono(audioBlob);
            if (this._log) this._log('[REC] converted_to_wav', { bytes: wav.size });
            blobToSend = wav;
          }
        } catch (e) {
          if (this._log) this._log('[REC] decode/convert failed, sending original blob', e);
          blobToSend = audioBlob;
        }
      }

      const formData = new FormData();
      const sendType = String(blobToSend.type || '').toLowerCase();
      const ext = sendType.includes('wav') ? 'wav' : ct.includes('ogg') ? 'ogg' : ct.includes('mp4') ? 'mp4' : 'webm';
      formData.append('audio', blobToSend, `recording.${ext}`);
      formData.append('client_id', clientId);
      formData.append('request_id', `asr_${Date.now()}_${Math.random().toString(16).slice(2)}`);

      if (this._asrAbort) {
        try {
          this._asrAbort.abort();
        } catch (_) {
          // ignore
        }
      }
      this._asrAbort = new AbortController();

      const response = await fetch(asrEndpoint, {
        method: 'POST',
        headers: { 'X-Client-ID': clientId },
        body: formData,
        signal: this._asrAbort.signal,
      });

      const result = await response.json();
      const text = result && result.text ? String(result.text) : '';

      if (text && typeof setInputText === 'function') {
        if (this._log) this._log('[REC] asr_text', { chars: String(text).length, preview: String(text).slice(0, 30) });
        try {
          setInputText((prev) => {
            const p = safeTrim(prev);
            const t = safeTrim(text);
            if (!t) return p;
            return p ? `${p} ${t}` : t;
          });
        } catch (_) {
          // ignore
        }
      }
    } catch (err) {
      if (this._log) this._log('[REC] processAudioHttp error', err);
    } finally {
      if (this._asrAbort) {
        try {
          this._asrAbort.abort();
        } catch (_) {
          // ignore
        }
        this._asrAbort = null;
      }
      this._setLoading(false);
    }
  }

  _ensureRecorder() {
    const baseUrl = this._deps.baseUrl;
    const clientId = safeTrim(this._deps.clientId);
    const minRecordMs = Number(this._deps.minRecordMs) || 900;

    if (this._recorder) return;

    if (this._asrMode === 'ws_pcm') {
      this._recorder = new PcmWsRecorderManager({
        wsUrl: buildAsrWsUrl(baseUrl),
        clientId,
        requestId: `asrws_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        sampleRate: 16000,
        onStateChange: (v) => this._setRecording(!!v),
        onPartialText: (text) => {
          const t = safeTrim(text);
          if (!t) return;
          const base = safeTrim(this._wsBaseText);
          this._appendOrReplaceInputText(base ? `${base} ${t}` : t);
        },
        onFinalText: (text) => {
          const t = safeTrim(text);
          const base = safeTrim(this._wsBaseText);
          if (t) this._appendOrReplaceInputText(base ? `${base} ${t}` : t);
          this._setLoading(false);
        },
        onError: (msg) => {
          this._setLoading(false);
          if (this._log) this._log('[REC] ws error', msg);
        },
        onLog: (...args) => (this._log ? this._log(...args) : null),
      });
      return;
    }

    this._recorder = new RecorderManager({
      minRecordMs,
      onStateChange: (v) => this._setRecording(!!v),
      onBlob: async (blob, meta) => {
        await this._processAudioHttp(blob, meta);
      },
      onLog: (...args) => (this._log ? this._log(...args) : null),
    });
  }

  async start() {
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

    try {
      await this._recorder.start();
    } catch (e) {
      this._setLoading(false);
      if (this._log) this._log('[REC] start failed', e);
    }
  }

  stop() {
    if (!this._recorder) return;

    const ttsEnabledRef = this._deps.ttsEnabledRef;
    const audioContextRef = this._deps.audioContextRef;
    const unlockAudio = this._deps.unlockAudio;

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

    try {
      this._recorder.stop();
    } catch (_) {
      // ignore
    }
  }

  cancel() {
    if (this._asrAbort) {
      try {
        this._asrAbort.abort();
      } catch (_) {
        // ignore
      } finally {
        this._asrAbort = null;
      }
    }
    try {
      if (this._recorder && this._recorder.isRecording) this._recorder.cancel();
    } catch (_) {
      // ignore
    }
    this._setLoading(false);
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
