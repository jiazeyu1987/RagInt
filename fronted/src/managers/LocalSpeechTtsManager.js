// Local (browser) TTS using SpeechSynthesis API.
// Keeps the same high-level interface as the server-streaming TTS manager.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isSpeechAvailable() {
  return typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
}

function safeCancelSpeech() {
  try {
    if (window && window.speechSynthesis) window.speechSynthesis.cancel();
  } catch (_) {
    // ignore
  }
}

export class LocalSpeechTtsManager {
  constructor(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    this._getClientId = typeof options.getClientId === 'function' ? options.getClientId : () => '';
    this._nowMs = typeof options.nowMs === 'function' ? options.nowMs : () => Date.now();
    this._log = typeof options.onLog === 'function' ? options.onLog : () => {};
    this._warn = typeof options.onWarn === 'function' ? options.onWarn : () => {};
    this._error = typeof options.onError === 'function' ? options.onError : () => {};
    this._onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    this._emitClientEvent = typeof options.emitClientEvent === 'function' ? options.emitClientEvent : null;

    const voice = options.voice && typeof options.voice === 'object' ? options.voice : {};
    this._voiceLang = String(voice.lang || 'zh-CN');
    this._voiceName = String(voice.name || '');
    this._voiceRate = Number.isFinite(Number(voice.rate)) ? Number(voice.rate) : 1.0;
    this._voicePitch = Number.isFinite(Number(voice.pitch)) ? Number(voice.pitch) : 1.0;
    this._voiceVolume = Number.isFinite(Number(voice.volume)) ? Number(voice.volume) : 1.0;

    this._token = 0;
    this._requestId = null;
    this._seq = 0;
    this._seenText = new Set();
    this._queue = [];
    this._ragDone = false;
    this._playerPromise = null;
  }

  _emit(name, fields, kind) {
    if (!this._emitClientEvent) return;
    const requestId = this._requestId;
    if (!requestId) return;
    try {
      this._emitClientEvent({
        requestId,
        clientId: this._getClientId(),
        kind: String(kind || 'client'),
        name: String(name || '').trim(),
        fields: fields && typeof fields === 'object' ? fields : {},
      });
    } catch (_) {
      // ignore
    }
  }

  setVoice(next) {
    const v = next && typeof next === 'object' ? next : {};
    if (v.lang != null) this._voiceLang = String(v.lang || '');
    if (v.name != null) this._voiceName = String(v.name || '');
    if (v.rate != null) this._voiceRate = Number.isFinite(Number(v.rate)) ? Number(v.rate) : this._voiceRate;
    if (v.pitch != null) this._voicePitch = Number.isFinite(Number(v.pitch)) ? Number(v.pitch) : this._voicePitch;
    if (v.volume != null) this._voiceVolume = Number.isFinite(Number(v.volume)) ? Number(v.volume) : this._voiceVolume;
  }

  resetForRun({ requestId } = {}) {
    this.stop('reset_for_run');
    this._token += 1;
    this._requestId = requestId || null;
    this._seq = 0;
    this._seenText = new Set();
    this._queue = [];
    this._ragDone = false;
  }

  stop(reason) {
    this._token += 1;
    this._ragDone = true;
    this._queue = [];
    this._playerPromise = null;
    safeCancelSpeech();
    if (reason) this._log('[TTS_LOCAL] stopped', reason);
    this._emit('play_cancelled', { reason: String(reason || 'stop') }, 'client');
  }

  markRagDone() {
    this._ragDone = true;
  }

  hasAnySegment() {
    return this._seenText && this._seenText.size > 0;
  }

  enqueueText(text, meta) {
    const seg = String(text || '').trim();
    if (!seg) return null;
    if (this._seenText.has(seg)) return null;
    this._seenText.add(seg);

    const seq = this._seq++;
    const stopIndex = meta && Number.isFinite(meta.stopIndex) ? Number(meta.stopIndex) : null;
    this._queue.push({ seq, stopIndex, text: seg });

    if (this._onDebug) {
      try {
        this._onDebug({ type: 'enqueue', t: this._nowMs(), seq, stopIndex, chars: seg.length });
      } catch (_) {
        // ignore
      }
    }

    return { seq, seg, stopIndex };
  }

  enqueueWavBytes(_wavBytes, _meta) {
    // Not supported for SpeechSynthesis; keep API compatibility.
    return null;
  }

  getStats() {
    const speaking = !!(isSpeechAvailable() && window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending));
    return {
      textCount: this._queue.length,
      audioCount: 0,
      generatorRunning: false,
      playerRunning: speaking || !!this._playerPromise,
      ragDone: !!this._ragDone,
    };
  }

  isBusy() {
    const s = this.getStats();
    return s.playerRunning || s.textCount > 0;
  }

  ensureRunning() {
    if (!this._requestId) return;
    if (!this._playerPromise) this._startPlayer();
  }

  async waitForIdle() {
    const token = this._token;
    while (this._token === token) {
      const player = this._playerPromise;
      const hasQueues = this._queue.length > 0;
      if (!player && !hasQueues) return;
      await Promise.allSettled([player].filter(Boolean));
    }
  }

  _pickVoice() {
    try {
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      if (!voices || !voices.length) return null;
      if (this._voiceName) {
        const byName = voices.find((v) => v && v.name === this._voiceName);
        if (byName) return byName;
      }
      if (this._voiceLang) {
        const langLower = this._voiceLang.toLowerCase();
        const byLang = voices.find((v) => v && typeof v.lang === 'string' && v.lang.toLowerCase().startsWith(langLower));
        if (byLang) return byLang;
      }
      return voices[0] || null;
    } catch (_) {
      return null;
    }
  }

  async _speakOnce(item, token) {
    if (!isSpeechAvailable()) {
      this._warn('[TTS_LOCAL] SpeechSynthesis not available; skipping');
      return;
    }
    if (this._token !== token) return;

    if (this._onDebug) {
      try {
        this._onDebug({
          type: 'tts_request',
          t: this._nowMs(),
          seq: typeof item.seq === 'number' ? item.seq : null,
          stopIndex: Number.isFinite(item.stopIndex) ? Number(item.stopIndex) : null,
        });
      } catch (_) {
        // ignore
      }
    }

    await new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        if (err) reject(err);
        else resolve();
      };

      const utter = new window.SpeechSynthesisUtterance(String(item.text || ''));
      if (this._voiceLang) utter.lang = this._voiceLang;
      utter.rate = this._voiceRate;
      utter.pitch = this._voicePitch;
      utter.volume = this._voiceVolume;

      const voice = this._pickVoice();
      if (voice) utter.voice = voice;

      utter.onstart = () => {
        if (this._onDebug) {
          try {
            this._onDebug({ type: 'tts_first_audio', t: this._nowMs(), seq: typeof item.seq === 'number' ? item.seq : null });
          } catch (_) {
            // ignore
          }
        }
      };
      utter.onend = () => finish();
      utter.onerror = (e) => finish(e && e.error ? new Error(String(e.error)) : new Error('SpeechSynthesis error'));

      try {
        window.speechSynthesis.speak(utter);
      } catch (e) {
        finish(e);
      }
    });

    if (this._onDebug) {
      try {
        this._onDebug({ type: 'tts_done', t: this._nowMs(), seq: typeof item.seq === 'number' ? item.seq : null });
      } catch (_) {
        // ignore
      }
    }
  }

  _startPlayer() {
    if (this._playerPromise) return;
    const token = this._token;

    this._playerPromise = (async () => {
      while (this._token === token) {
        const item = this._queue.shift();
        if (!item) {
          if (this._ragDone) break;
          await sleep(30);
          continue;
        }
        try {
          await this._speakOnce(item, token);
        } catch (err) {
          this._warn('[TTS_LOCAL] speak_error', err);
          // If SpeechSynthesis gets stuck, cancel and continue.
          safeCancelSpeech();
        }
      }
    })()
      .catch((err) => {
        this._error('[TTS_LOCAL] player_error', err);
      })
      .finally(() => {
        if (this._token === token) this._playerPromise = null;
        if (this._token === token && this._ragDone && this._queue.length === 0) {
          this._emit('play_end', { t_client_ms: this._nowMs() }, 'client');
        }
      });
  }
}

