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
    this._maxPreGenerateCount = Math.max(0, Number(options.maxPreGenerateCount || 2) || 2);

    this._onStopIndexChange = typeof options.onStopIndexChange === 'function' ? options.onStopIndexChange : null;
    this._onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    this._emitClientEvent = typeof options.emitClientEvent === 'function' ? options.emitClientEvent : null;
    this._onAbnormalAudio = typeof options.onAbnormalAudio === 'function' ? options.onAbnormalAudio : null;

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

  _buildSegmentUrl(text) {
    const seg = String(text || '').trim();
    if (!seg) return null;
    const url = new URL(this._useSavedTts ? '/api/text_to_speech_saved' : '/api/text_to_speech_stream', this._baseUrl);
    url.searchParams.set('text', seg);
    if (this._requestId) url.searchParams.set('request_id', this._requestId);
    const cid = this._getClientId();
    if (cid) url.searchParams.set('client_id', cid);
    url.searchParams.set('segment_index', String(this._segmentIndex++));
    return url.toString();
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
        const audioUrl = this._buildSegmentUrl(nextSegment);
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
          } catch (err) {
            const msg = String((err && err.message) || err || '');
            const isAbnormal =
              msg.includes('PCM sanity check failed') ||
              msg.includes('white-noise') ||
              msg.includes('white noise') ||
              msg.includes('silence suspected') ||
              msg.includes('clipping suspected');

            this._warn('[TTSQ] audio_play_failed', err);
            if (isAbnormal) {
              this._emit(
                'tts_audio_abnormal',
                {
                  err: msg.slice(0, 200),
                  seq: typeof audioItem.seq === 'number' ? audioItem.seq : null,
                  stop_index: Number.isFinite(audioItem.stopIndex) ? Number(audioItem.stopIndex) : null,
                },
                'tts'
              );
              if (this._onAbnormalAudio) {
                try {
                  this._onAbnormalAudio({ err: msg, seq: audioItem.seq, stopIndex: audioItem.stopIndex });
                } catch (_) {
                  // ignore
                }
              }
              // SD-4.3: degrade to text-only for this run by stopping further audio.
              this.stop('audio_abnormal');
              break;
            }
            throw err;
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
      }
    })()
      .catch((err) => {
        this._error('[TTSQ] player_error', err);
      })
      .finally(() => {
        if (this._token === token) this._playerPromise = null;
        // SD-6: t_play_end (client-side playback end). Best-effort.
        if (this._token === token && this._ragDone && !this._generatorPromise && this._audioQueue.length === 0) {
          this._emit('play_end', { t_client_ms: this._nowMs() }, 'client');
        }
      });
  }
}
