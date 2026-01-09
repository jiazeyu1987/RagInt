// Flow-oriented TTS queue manager extracted from App.js.
// Responsibilities:
// - Deduplicate + enqueue text segments
// - Background "generator" converts text -> request URL (streaming endpoint)
// - Foreground "player" plays queued items sequentially

import { playWavBytesViaDecodeAudioData, playWavStreamViaWebAudio, playWavViaDecodeAudioData } from '../audio/ttsAudio';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeStopCurrentAudio(currentAudioRef) {
  try {
    const cur = currentAudioRef && currentAudioRef.current;
    if (!cur) return;
    if (typeof cur.stop === 'function') {
      cur.stop();
      return;
    }
    if (typeof cur.pause === 'function') {
      cur.pause();
      try {
        cur.src = '';
      } catch (_) {
        // ignore
      }
    }
  } catch (_) {
    // ignore
  } finally {
    if (currentAudioRef) currentAudioRef.current = null;
  }
}

async function playAudioElementUrl(url, currentAudioRef) {
  if (!url) return;
  await new Promise((resolve, reject) => {
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('Audio playback failed'));
    audio.play().catch(reject);
  });
}

export class TtsQueueManager {
  constructor(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    this._audioContextRef = options.audioContextRef;
    this._currentAudioRef = options.currentAudioRef;
    this._getRunId = typeof options.getRunId === 'function' ? options.getRunId : () => 0;
    this._getClientId = typeof options.getClientId === 'function' ? options.getClientId : () => '';
    this._nowMs = typeof options.nowMs === 'function' ? options.nowMs : () => Date.now();
    this._log = typeof options.onLog === 'function' ? options.onLog : () => {};
    this._warn = typeof options.onWarn === 'function' ? options.onWarn : () => {};
    this._error = typeof options.onError === 'function' ? options.onError : () => {};

    this._baseUrl = String(options.baseUrl || 'http://localhost:8000');
    this._useSavedTts = !!options.useSavedTts;
    this._ttsProvider = String(options.ttsProvider || '').trim();
    this._ttsVoice = String(options.ttsVoice || '').trim();
    this._ttsSpeed = Number.isFinite(Number(options.ttsSpeed)) ? Number(options.ttsSpeed) : 1.0;
    this._recordingId = String(options.recordingId || '').trim();
    this._maxPreGenerateCount = Math.max(0, Number(options.maxPreGenerateCount || 2) || 2);

    this._onStopIndexChange = typeof options.onStopIndexChange === 'function' ? options.onStopIndexChange : null;
    this._onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    this._emitClientEvent = typeof options.emitClientEvent === 'function' ? options.emitClientEvent : null;

    this._token = 0;
    this._requestId = null;
    this._segmentIndex = 0;
    this._seq = 0;

    this._textQueue = [];
    this._metaQueue = [];
    this._audioQueue = [];
    this._seenText = new Set();
    this._ragDone = false;

    this._generatorPromise = null;
    this._playerPromise = null;
    this._currentItem = null;
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

  resetForRun({ requestId } = {}) {
    this.stop('reset_for_run');
    this._resetStateForRun(requestId || null);
  }

  _resetStateForRun(requestId) {
    this._token += 1;
    this._requestId = requestId || null;
    this._segmentIndex = 0;
    this._seq = 0;
    this._ragDone = false;
    this._textQueue = [];
    this._metaQueue = [];
    this._audioQueue = [];
    this._seenText = new Set();
  }

  stop(reason) {
    this._token += 1;
    this._ragDone = true;
    this._textQueue = [];
    this._metaQueue = [];
    this._audioQueue = [];
    this._generatorPromise = null;
    this._playerPromise = null;
    this._currentItem = null;
    safeStopCurrentAudio(this._currentAudioRef);
    if (reason) this._log('[TTSQ] stopped', reason);
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
    this._textQueue.push(seg);
    this._metaQueue.push({ seq, stopIndex });

    if (this._onDebug) {
      try {
        this._onDebug({ type: 'enqueue', t: this._nowMs(), seq, stopIndex, chars: seg.length });
      } catch (_) {
        // ignore
      }
    }

    return { seq, seg, stopIndex };
  }

  capturePendingTextByStopIndex(stopIndex) {
    const idx = Number.isFinite(Number(stopIndex)) ? Number(stopIndex) : null;
    if (idx == null) return [];

    const out = [];

    const cur = this._currentItem;
    if (cur && Number(cur.stopIndex) === idx && cur.text) out.push(String(cur.text));

    for (const item of this._audioQueue || []) {
      if (!item) continue;
      if (Number(item.stopIndex) !== idx) continue;
      if (item.text) out.push(String(item.text));
    }

    const n = Math.min((this._textQueue || []).length, (this._metaQueue || []).length);
    for (let i = 0; i < n; i++) {
      const meta = this._metaQueue[i];
      if (!meta || Number(meta.stopIndex) !== idx) continue;
      const seg = this._textQueue[i];
      if (seg) out.push(String(seg));
    }

    const cleaned = [];
    let last = null;
    for (const s of out) {
      const t = String(s || '').trim();
      if (!t) continue;
      if (t === last) continue;
      cleaned.push(t);
      last = t;
    }
    return cleaned;
  }

  capturePendingAudioByStopIndex(stopIndex) {
    const idx = Number.isFinite(Number(stopIndex)) ? Number(stopIndex) : null;
    if (idx == null) return [];

    const out = [];

    const cur = this._currentItem;
    if (cur && Number(cur.stopIndex) === idx && cur.url) {
      out.push({ audio_url: String(cur.url), text: cur.text ? String(cur.text) : '' });
    }

    for (const item of this._audioQueue || []) {
      if (!item) continue;
      if (Number(item.stopIndex) !== idx) continue;
      if (!item.url) continue;
      out.push({ audio_url: String(item.url), text: item.text ? String(item.text) : '' });
    }

    const cleaned = [];
    let lastUrl = null;
    for (const s of out) {
      const u = s && s.audio_url ? String(s.audio_url || '').trim() : '';
      if (!u) continue;
      if (u === lastUrl) continue;
      cleaned.push({ audio_url: u, text: s && s.text ? String(s.text || '') : '' });
      lastUrl = u;
    }
    return cleaned;
  }

  enqueueWavBytes(wavBytes, meta) {
    if (!wavBytes) return null;
    const seq = meta && typeof meta.seq === 'number' ? meta.seq : this._seq++;
    const stopIndex = meta && Number.isFinite(meta.stopIndex) ? Number(meta.stopIndex) : null;
    this._audioQueue.push({ seq, stopIndex, wavBytes, url: null, text: meta && meta.text ? String(meta.text) : '' });
    this.ensureRunning();
    return { seq, stopIndex };
  }

  getStats() {
    return {
      textCount: this._textQueue.length,
      audioCount: this._audioQueue.length,
      generatorRunning: !!this._generatorPromise,
      playerRunning: !!this._playerPromise,
      ragDone: !!this._ragDone,
    };
  }

  isBusy() {
    const s = this.getStats();
    return s.generatorRunning || s.playerRunning || s.textCount > 0 || s.audioCount > 0;
  }

  ensureRunning() {
    if (!this._requestId) return;
    if (!this._generatorPromise) this._startGenerator();
    if (!this._playerPromise && this._audioQueue.length > 0) this._startPlayer();
  }

  async waitForIdle() {
    const token = this._token;
    while (this._token === token) {
      const gen = this._generatorPromise;
      const player = this._playerPromise;
      const hasQueues = this._textQueue.length > 0 || this._audioQueue.length > 0;
      if (!gen && !player && !hasQueues) return;
      await Promise.allSettled([gen, player].filter(Boolean));
    }
  }

  _buildSegmentUrl(text, meta) {
    const seg = String(text || '').trim();
    if (!seg) return null;
    const url = new URL(this._useSavedTts ? '/api/text_to_speech_saved' : '/api/text_to_speech_stream', this._baseUrl);
    url.searchParams.set('text', seg);
    if (this._requestId) url.searchParams.set('request_id', this._requestId);
    const cid = this._getClientId();
    if (cid) url.searchParams.set('client_id', cid);
    if (this._ttsProvider) url.searchParams.set('tts_provider', this._ttsProvider);
    if (this._ttsVoice) url.searchParams.set('tts_voice', this._ttsVoice);
    if (Number.isFinite(this._ttsSpeed) && Math.abs(Number(this._ttsSpeed) - 1.0) > 1e-6) url.searchParams.set('tts_speed', String(this._ttsSpeed));
    url.searchParams.set('segment_index', String(this._segmentIndex++));
    if (this._recordingId) url.searchParams.set('recording_id', this._recordingId);
    const stopIndex = meta && Number.isFinite(meta.stopIndex) ? Number(meta.stopIndex) : null;
    if (this._recordingId && stopIndex != null) url.searchParams.set('stop_index', String(stopIndex));
    return url.toString();
  }

  setRecordingId(next, reason) {
    const val = String(next || '').trim();
    if (val === this._recordingId) return;
    this._recordingId = val;
    if (reason) this._log('[TTSQ] recording_id_changed', val, reason);
  }

  enqueueAudioUrl(url, meta) {
    const u = String(url || '').trim();
    if (!u) return null;
    const seq = this._seq++;
    const stopIndex = meta && Number.isFinite(meta.stopIndex) ? Number(meta.stopIndex) : null;
    const text = meta && typeof meta.text === 'string' ? meta.text : '';

    if (this._onDebug) {
      try {
        this._onDebug({ type: 'enqueue', t: this._nowMs(), seq, stopIndex, chars: (text || '').length });
      } catch (_) {
        // ignore
      }
    }

    this._audioQueue.push({
      seq,
      stopIndex,
      text,
      url: u,
      recorded: true,
    });

    if (!this._playerPromise && this._audioQueue.length > 0) this._startPlayer();
    return { seq, stopIndex };
  }

  setTtsProvider(next, reason) {
    const val = String(next || '').trim();
    if (val === this._ttsProvider) return;
    this._ttsProvider = val;
    if (reason) this._log('[TTSQ] tts_provider_changed', val, reason);
    // Stop current playback/fetch to avoid mixing providers mid-run.
    const rid = this._requestId;
    this.stop('tts_provider_changed');
    if (rid) this._resetStateForRun(rid);
  }

  setTtsVoice(next, reason) {
    const val = String(next || '').trim();
    if (val === this._ttsVoice) return;
    this._ttsVoice = val;
    if (reason) this._log('[TTSQ] tts_voice_changed', val, reason);
    // Stop current playback/fetch to avoid mixing voices mid-run.
    const rid = this._requestId;
    this.stop('tts_voice_changed');
    if (rid) this._resetStateForRun(rid);
  }

  setTtsSpeed(next, reason) {
    const val = Number.isFinite(Number(next)) ? Number(next) : 1.0;
    if (Math.abs(val - this._ttsSpeed) < 1e-6) return;
    this._ttsSpeed = val;
    if (reason) this._log('[TTSQ] tts_speed_changed', val, reason);
    const rid = this._requestId;
    this.stop('tts_speed_changed');
    if (rid) this._resetStateForRun(rid);
  }

  _startGenerator() {
    if (this._generatorPromise) return;
    const token = this._token;

    this._generatorPromise = (async () => {
      while (this._token === token) {
        if (this._audioQueue.length >= this._maxPreGenerateCount) {
          await sleep(50);
          continue;
        }

        const nextSegment = this._textQueue[0];
        if (!nextSegment) {
          if (this._ragDone) break;
          await sleep(50);
          continue;
        }

        this._textQueue.shift();
        const meta = this._metaQueue.shift();
        const audioUrl = this._buildSegmentUrl(nextSegment, meta);
        if (audioUrl) {
          this._audioQueue.push({
            seq: meta && typeof meta.seq === 'number' ? meta.seq : null,
            stopIndex: meta && Number.isFinite(meta.stopIndex) ? meta.stopIndex : null,
            text: nextSegment,
            url: audioUrl,
          });
        }

        if (!this._playerPromise && this._audioQueue.length > 0) this._startPlayer();
      }
    })()
      .catch((err) => {
        this._error('[TTSQ] generator_error', err);
      })
      .finally(() => {
        if (this._token === token) this._generatorPromise = null;
      });
  }

  _startPlayer() {
    if (this._playerPromise) return;
    const token = this._token;

    this._playerPromise = (async () => {
      while (this._token === token) {
        const audioItem = this._audioQueue.shift();
        if (!audioItem) {
          if (this._ragDone && !this._generatorPromise) break;
          await sleep(50);
          continue;
        }

        this._currentItem = audioItem;

        if (this._onStopIndexChange && Number.isFinite(audioItem.stopIndex)) {
          try {
            this._onStopIndexChange(Number(audioItem.stopIndex));
          } catch (_) {
            // ignore
          }
        }

        if (this._onDebug) {
          try {
            this._onDebug({
              type: 'tts_request',
              t: this._nowMs(),
              seq: typeof audioItem.seq === 'number' ? audioItem.seq : null,
              stopIndex: Number.isFinite(audioItem.stopIndex) ? Number(audioItem.stopIndex) : null,
            });
          } catch (_) {
            // ignore
          }
        }

        try {
          if (audioItem && audioItem.wavBytes) {
            try {
              await playWavBytesViaDecodeAudioData(audioItem.wavBytes, this._audioContextRef, this._currentAudioRef);
            } catch (err) {
              this._warn('[TTSQ] prefetched_wav_playback_failed_fallback_to_stream', err);
              if (audioItem.url) {
                await playWavStreamViaWebAudio(
                  audioItem.url,
                  this._audioContextRef,
                  this._currentAudioRef,
                  () => playAudioElementUrl(audioItem.url, this._currentAudioRef),
                  () => {
                    if (!this._onDebug) return;
                    try {
                      this._onDebug({
                        type: 'tts_first_audio',
                        t: this._nowMs(),
                        seq: typeof audioItem.seq === 'number' ? audioItem.seq : null,
                      });
                    } catch (_) {
                      // ignore
                    }
                  }
                );
              }
            }
          } else if (audioItem && audioItem.recorded) {
            try {
              await playWavViaDecodeAudioData(audioItem.url, this._audioContextRef, this._currentAudioRef);
            } catch (err) {
              this._warn('[TTSQ] recorded_wav_playback_failed_fallback_to_audio', err);
              await playAudioElementUrl(audioItem.url, this._currentAudioRef);
            }
          } else if (this._useSavedTts) {
            try {
              await playWavViaDecodeAudioData(audioItem.url, this._audioContextRef, this._currentAudioRef);
            } catch (err) {
              this._warn('[TTSQ] saved_wav_playback_failed_fallback_to_audio', err);
              await playAudioElementUrl(audioItem.url, this._currentAudioRef);
            }
          } else {
            await playWavStreamViaWebAudio(
              audioItem.url,
              this._audioContextRef,
              this._currentAudioRef,
              () => playAudioElementUrl(audioItem.url, this._currentAudioRef),
              () => {
                if (!this._onDebug) return;
                try {
                  this._onDebug({
                    type: 'tts_first_audio',
                    t: this._nowMs(),
                    seq: typeof audioItem.seq === 'number' ? audioItem.seq : null,
                  });
                } catch (_) {
                  // ignore
                }
              }
            );
          }
        } finally {
          if (this._currentAudioRef && this._currentAudioRef.current) this._currentAudioRef.current = null;
        }

        if (this._onDebug) {
          try {
            this._onDebug({
              type: 'tts_done',
              t: this._nowMs(),
              seq: typeof audioItem.seq === 'number' ? audioItem.seq : null,
            });
          } catch (_) {
            // ignore
          }
        }

        if (this._token === token) this._currentItem = null;
      }
    })()
      .catch((err) => {
        this._error('[TTSQ] player_error', err);
      })
      .finally(() => {
        if (this._token === token) this._playerPromise = null;
        if (this._token === token) this._currentItem = null;
        // SD-6: t_play_end (client-side playback end). Best-effort.
        if (this._token === token && this._ragDone && !this._generatorPromise && this._audioQueue.length === 0) {
          this._emit('play_end', { t_client_ms: this._nowMs() }, 'client');
        }
      });
  }
}
