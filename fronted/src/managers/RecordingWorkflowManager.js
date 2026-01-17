import { RecorderManager } from './RecorderManager';
import { PcmWsRecorderManager } from './PcmWsRecorderManager';
import { buildAsrHttpEndpoint, buildAsrWsUrl } from '../config/voiceEndpoints';

function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

export class RecordingWorkflowManager {
  constructor({ onLog } = {}) {
    this._log = typeof onLog === 'function' ? onLog : null;

    this._deps = {};
    this._recordPointerId = null;
    this._asrAbort = null;
    this._wsBaseText = '';
    this._wsRequireWake = false;
    this._wsAwakened = true;
    this._wsConfigSig = '';
    this._wsRequireWakeActive = false;
    this._wakeHoldMs = 8000;
    this._wakeHoldUntilMs = 0;

    this._recorder = null;
    this._asrMode = 'http';

    this._pendingFinalText = [];
  }

  setDeps(next = {}) {
    const prevSig = this._wsConfigSig;
    this._deps = { ...(this._deps || {}), ...(next || {}) };
    this._asrMode = String(this._deps.asrMode || 'http');
    this._wsRequireWake = !!this._deps.wsRequireWake;

    // Recreate ws_pcm recorder if wake config changed (PcmWsRecorderManager captures startPayload at construction).
    const sig = JSON.stringify({
      asrMode: this._asrMode,
      wsRequireWake: !!this._wsRequireWake,
      wakeWord: safeTrim(this._deps.wakeWord),
      wakeWordStrict: !!this._deps.wakeWordStrict,
      wakeWordCooldownMs: Number(this._deps.wakeWordCooldownMs) || 0,
      wakeHoldMs: Number(this._deps.wakeHoldMs) || 0,
      baseUrl: safeTrim(this._deps.baseUrl),
      clientId: safeTrim(this._deps.clientId),
    });
    this._wsConfigSig = sig;
    if (prevSig && sig !== prevSig && this._recorder && this._asrMode === 'ws_pcm') {
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
      this._emitFinalText(text);
    } catch (err) {
      if (this._log) this._log('[REC] processAudioHttp error', err);
      this._emitFinalText('');
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
    const wakeWord = safeTrim(this._deps.wakeWord);
    const strict = !!this._deps.wakeWordStrict;
    const wakeMatchMode = strict ? 'prefix' : 'contains';
    const wakeCooldownMs = Number(this._deps.wakeWordCooldownMs) || 0;

    if (this._recorder) return;

    if (this._asrMode === 'ws_pcm') {
      const holdActive = Date.now() < (Number(this._wakeHoldUntilMs) || 0);
      const requireWake = !!this._wsRequireWake && !!wakeWord && !holdActive;
      this._recorder = new PcmWsRecorderManager({
        wsUrl: buildAsrWsUrl(baseUrl, { role: 'rec' }),
        label: 'rec',
        clientId,
        requestId: `asrws_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        sampleRate: 16000,
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
        onPartialText: (text) => {
          if (requireWake && !this._wsAwakened) return;
          const t = safeTrim(text);
          if (!t) return;
          if (this._wsRequireWake && wakeWord) this._wakeHoldUntilMs = Date.now() + this._wakeHoldMs;
          const base = safeTrim(this._wsBaseText);
          this._appendOrReplaceInputText(base ? `${base} ${t}` : t);
        },
        onFinalText: (text) => {
          if (requireWake && !this._wsAwakened) {
            this._setLoading(false);
            this._emitFinalText('');
            return;
          }
          const t = safeTrim(text);
          const base = safeTrim(this._wsBaseText);
          if (t) this._appendOrReplaceInputText(base ? `${base} ${t}` : t);
          if (t && this._wsRequireWake && wakeWord) this._wakeHoldUntilMs = Date.now() + this._wakeHoldMs;
          this._setLoading(false);
          this._emitFinalText(t);
        },
        onError: (msg) => {
          this._setLoading(false);
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
    // For ws_pcm, startPayload/gating decisions are captured at construction time.
    // Recreate per session so wake-hold state is applied immediately on the next press.
    if (this._asrMode === 'ws_pcm' && this._recorder) {
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
    this._wsRequireWakeActive = !!this._wsRequireWake && !!safeTrim(this._deps.wakeWord);
    const holdActive = Date.now() < (Number(this._wakeHoldUntilMs) || 0);
    this._wsAwakened = holdActive ? true : !this._wsRequireWakeActive;
    this._wakeHoldMs = Math.max(500, Math.min(120000, Math.round(Number(this._deps.wakeHoldMs) || 8000)));

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

    try {
      this._recorder.stop();
    } catch (_) {
      // ignore
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
