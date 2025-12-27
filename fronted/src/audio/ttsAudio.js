// Audio/TTS helpers extracted from App.js to keep component lean.
// These utilities intentionally depend only on browser APIs (WebAudio + fetch).

export async function playWavViaDecodeAudioData(url, audioContextRef, currentAudioRef) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('WebAudio is not supported');

  if (!audioContextRef.current) {
    audioContextRef.current = new AudioContextClass();
  }
  const audioCtx = audioContextRef.current;
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (_) {
      // ignore
    }
  }

  const abortController = new AbortController();
  let sourceNode = null;
  currentAudioRef.current = {
    stop: () => {
      try {
        abortController.abort();
      } catch (_) {
        // ignore
      }
      try {
        if (sourceNode) sourceNode.stop(0);
      } catch (_) {
        // ignore
      }
    },
  };

  const response = await fetch(url, { signal: abortController.signal });
  if (!response.ok) throw new Error(`TTS HTTP error: ${response.status}`);
  const buf = new Uint8Array(await response.arrayBuffer());

  // Patch RIFF/data sizes for streamed WAVs (some servers use placeholders).
  const patchWavSizes = (bytes) => {
    if (bytes.byteLength < 44) return bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fourcc = (off) =>
      String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
    if (fourcc(0) !== 'RIFF' || fourcc(8) !== 'WAVE') return bytes;

    let offset = 12;
    let dataOffset = null;
    let dataSizeOffset = null;
    while (offset + 8 <= bytes.byteLength) {
      const id = fourcc(offset);
      const size = view.getUint32(offset + 4, true);
      const payload = offset + 8;
      if (id === 'data') {
        dataOffset = payload;
        dataSizeOffset = offset + 4;
        break;
      }
      offset = payload + size;
      if (offset % 2 === 1) offset += 1;
    }
    if (dataOffset == null || dataSizeOffset == null) return bytes;

    const riffSize = bytes.byteLength - 8;
    const dataSize = bytes.byteLength - dataOffset;
    view.setUint32(4, riffSize >>> 0, true);
    view.setUint32(dataSizeOffset, dataSize >>> 0, true);
    return bytes;
  };

  const patched = patchWavSizes(buf);
  const audioBuffer = await audioCtx.decodeAudioData(patched.buffer.slice(patched.byteOffset, patched.byteOffset + patched.byteLength));

  await new Promise((resolve, reject) => {
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioCtx.destination);
    sourceNode.onended = () => resolve();
    try {
      sourceNode.start(0);
    } catch (e) {
      reject(e);
    }
  });
}

export async function playWavBytesViaDecodeAudioData(wavBytes, audioContextRef, currentAudioRef) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('WebAudio is not supported');

  const tryParseWavSampleRate = (bytes) => {
    try {
      if (!bytes || bytes.byteLength < 44) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const fourcc = (off) =>
        String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
      if (fourcc(0) !== 'RIFF' || fourcc(8) !== 'WAVE') return null;
      let offset = 12;
      while (offset + 8 <= bytes.byteLength) {
        const id = fourcc(offset);
        const size = view.getUint32(offset + 4, true);
        const payload = offset + 8;
        if (id === 'fmt ') {
          if (payload + 16 > bytes.byteLength) return null;
          const sampleRate = view.getUint32(payload + 4, true);
          if (sampleRate && sampleRate >= 8000 && sampleRate <= 48000) return sampleRate;
          return null;
        }
        offset = payload + size;
        if (offset % 2 === 1) offset += 1;
      }
    } catch (_) {
      // ignore
    }
    return null;
  };

  if (!audioContextRef.current) {
    // Prefer creating AudioContext at WAV sample rate to avoid resampling artifacts.
    const sr = tryParseWavSampleRate(wavBytes);
    try {
      audioContextRef.current = sr ? new AudioContextClass({ sampleRate: sr }) : new AudioContextClass();
    } catch (_) {
      audioContextRef.current = new AudioContextClass();
    }
  }
  const audioCtx = audioContextRef.current;
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (_) {
      // ignore
    }
  }

  let sourceNode = null;
  currentAudioRef.current = {
    stop: () => {
      try {
        if (sourceNode) sourceNode.stop(0);
      } catch (_) {
        // ignore
      }
    },
  };

  const patchWavSizes = (bytes) => {
    if (!bytes || bytes.byteLength < 44) return bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fourcc = (off) =>
      String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
    if (fourcc(0) !== 'RIFF' || fourcc(8) !== 'WAVE') return bytes;

    let offset = 12;
    let dataOffset = null;
    let dataSizeOffset = null;
    while (offset + 8 <= bytes.byteLength) {
      const id = fourcc(offset);
      const size = view.getUint32(offset + 4, true);
      const payload = offset + 8;
      if (id === 'data') {
        dataOffset = payload;
        dataSizeOffset = offset + 4;
        break;
      }
      offset = payload + size;
      if (offset % 2 === 1) offset += 1;
    }
    if (dataOffset == null || dataSizeOffset == null) return bytes;

    const riffSize = bytes.byteLength - 8;
    const dataSize = bytes.byteLength - dataOffset;
    view.setUint32(4, riffSize >>> 0, true);
    view.setUint32(dataSizeOffset, dataSize >>> 0, true);
    return bytes;
  };

  const patched = patchWavSizes(wavBytes);
  const audioBuffer = await audioCtx.decodeAudioData(patched.buffer.slice(patched.byteOffset, patched.byteOffset + patched.byteLength));

  await new Promise((resolve, reject) => {
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioCtx.destination);
    sourceNode.onended = () => resolve();
    try {
      sourceNode.start(0);
    } catch (e) {
      reject(e);
    }
  });
}

export async function playWavStreamViaWebAudio(url, audioContextRef, currentAudioRef, fallbackPlay, onFirstAudioChunk) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    if (fallbackPlay) return fallbackPlay();
    throw new Error('WebAudio is not supported');
  }

  const abortController = new AbortController();
  let audioCtx = null;
  let pcmQueue = [];
  let pcmQueueIndex = 0;
  let pcmQueueOffset = 0;
  let ended = false;
  let queuedSamples = 0; // interleaved samples at audioCtx.sampleRate
  let scheduledCount = 0;
  let endedCount = 0;
  let playbackStarted = false;
  let nextStartTime = 0;
  let drainedResolver = null;
  let drainedPromise = new Promise((resolve) => (drainedResolver = resolve));

  const sources = [];
  const stopAllSources = () => {
    while (sources.length) {
      const src = sources.pop();
      try {
        src.stop(0);
      } catch (_) {
        // ignore
      }
    }
  };

  const stopPlayback = () => {
    try {
      abortController.abort();
    } catch (_) {
      // ignore
    }
    stopAllSources();
    try {
      if (drainedResolver) drainedResolver();
    } catch (_) {
      // ignore
    }
  };

  currentAudioRef.current = { stop: stopPlayback };

  const parseWavHeader = (headerBytes) => {
    const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
    const readFourCC = (offset) =>
      String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

    if (headerBytes.byteLength < 44) throw new Error('WAV header too short');
    if (readFourCC(0) !== 'RIFF' || readFourCC(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE stream');

    let channels = 1;
    let sampleRate = 32000;
    let bitsPerSample = 16;
    let audioFormatCode = 1;
    let dataOffset = null;

    let offset = 12;
    while (offset + 8 <= headerBytes.byteLength) {
      const chunkId = readFourCC(offset);
      const chunkSize = view.getUint32(offset + 4, true);
      const payloadOffset = offset + 8;

      if (chunkId === 'fmt ' && payloadOffset + 16 <= headerBytes.byteLength) {
        audioFormatCode = view.getUint16(payloadOffset + 0, true);
        channels = view.getUint16(payloadOffset + 2, true);
        sampleRate = view.getUint32(payloadOffset + 4, true);
        bitsPerSample = view.getUint16(payloadOffset + 14, true);
      } else if (chunkId === 'data') {
        dataOffset = payloadOffset;
        break;
      }

      offset = payloadOffset + chunkSize;
      if (offset % 2 === 1) offset += 1;
    }

    if (dataOffset == null) throw new Error('WAV header incomplete (no data chunk yet)');
    return { channels, sampleRate, bitsPerSample, audioFormatCode, dataOffset };
  };

  try {
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok || !response.body) throw new Error(`TTS stream HTTP error: ${response.status}`);

    const reader = response.body.getReader();
    let headerBuffer = new Uint8Array(0);
    let wavInfo = null;
    let pcmRemainder = new Uint8Array(0);
    let firstAudioEmitted = false;

    let sanityDone = false;
    let sanitySamples = [];

    const ensureAudioContext = async (targetSampleRate) => {
      if (audioContextRef.current) {
        audioCtx = audioContextRef.current;
        if (audioCtx.state === 'suspended') {
          try {
            await audioCtx.resume();
          } catch (_) {
            // ignore
          }
        }
        return;
      }
      try {
        audioContextRef.current = new AudioContextClass({ sampleRate: targetSampleRate });
      } catch (_) {
        audioContextRef.current = new AudioContextClass();
      }
      audioCtx = audioContextRef.current;
      if (audioCtx && audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (_) {
          // ignore
        }
      }
    };

    let resampleState = null;
    const ensureResampler = () => {
      if (!audioCtx || !wavInfo) return;
      if (audioCtx.sampleRate === wavInfo.sampleRate) {
        resampleState = null;
        return;
      }
      if (resampleState) return;
      console.log(`[TTS] sampleRate mismatch: wav=${wavInfo.sampleRate}Hz audioCtx=${audioCtx.sampleRate}Hz; enabling resampler`);
      resampleState = {
        channels: wavInfo.channels,
        srcRate: wavInfo.sampleRate,
        dstRate: audioCtx.sampleRate,
        step: wavInfo.sampleRate / audioCtx.sampleRate,
        carry: new Float32Array(0),
        srcPos: 0,
      };
    };

    const resampleInterleaved = (inputInterleaved) => {
      if (!resampleState) return inputInterleaved;
      const { channels, step } = resampleState;
      const carry = resampleState.carry;
      const merged = new Float32Array(carry.length + inputInterleaved.length);
      merged.set(carry, 0);
      merged.set(inputInterleaved, carry.length);
      let srcPos = resampleState.srcPos;
      if (merged.length < channels * 2) {
        resampleState.carry = merged;
        resampleState.srcPos = srcPos;
        return new Float32Array(0);
      }

      const out = [];
      const maxSrcFrame = Math.floor(merged.length / channels) - 2;
      while (srcPos < maxSrcFrame) {
        const i0 = Math.floor(srcPos);
        const frac = srcPos - i0;
        const base0 = i0 * channels;
        const base1 = (i0 + 1) * channels;
        for (let ch = 0; ch < channels; ch++) {
          const s0 = merged[base0 + ch];
          const s1 = merged[base1 + ch];
          out.push(s0 + (s1 - s0) * frac);
        }
        srcPos += step;
      }

      const carryStartFrame = Math.floor(srcPos);
      const carryStart = carryStartFrame * channels;
      resampleState.carry = carryStart < merged.length ? merged.slice(carryStart) : new Float32Array(0);
      resampleState.srcPos = srcPos - carryStartFrame;

      return new Float32Array(out);
    };

    const scheduleAudioIfPossible = () => {
      if (!audioCtx || !wavInfo) return;
      if (abortController.signal.aborted) return;

      const channels = wavInfo.channels;
      const sr = audioCtx.sampleRate;
      const prebufferFrames = Math.max(1, Math.round(sr * 0.25)); // 250ms jitter buffer
      const scheduleFrames = Math.max(1, Math.round(sr * 0.12)); // ~120ms chunks

      const ensureQueueCompaction = () => {
        if (pcmQueueIndex > 32) {
          pcmQueue = pcmQueue.slice(pcmQueueIndex);
          pcmQueueIndex = 0;
        }
      };

      const pullNextSample = () => {
        const cur = pcmQueue[pcmQueueIndex];
        if (!cur) return 0;
        const v = cur[pcmQueueOffset];
        pcmQueueOffset += 1;
        queuedSamples -= 1;
        if (pcmQueueOffset >= cur.length) {
          pcmQueueIndex += 1;
          pcmQueueOffset = 0;
          ensureQueueCompaction();
        }
        return v;
      };

      const maybeResolveDrain = () => {
        if (!ended) return;
        if (queuedSamples > 0) return;
        if (endedCount < scheduledCount) return;
        try {
          if (drainedResolver) drainedResolver();
        } catch (_) {
          // ignore
        }
      };

      const scheduleOne = (frames) => {
        if (frames <= 0) return;
        const buffer = audioCtx.createBuffer(channels, frames, sr);
        const outs = [];
        for (let ch = 0; ch < channels; ch++) outs.push(buffer.getChannelData(ch));
        for (let f = 0; f < frames; f++) {
          for (let ch = 0; ch < channels; ch++) {
            outs[ch][f] = pullNextSample();
          }
        }

        const now = audioCtx.currentTime;
        const minDelay = playbackStarted ? 0.01 : 0.06;
        let startAt = playbackStarted ? nextStartTime : Math.max(now + minDelay, nextStartTime);
        if (playbackStarted && startAt < now - 0.02) {
          console.warn('[TTS] audio_schedule_underrun resetting', { behind_s: (now - startAt).toFixed(3) });
          startAt = now + 0.06;
        }
        playbackStarted = true;
        nextStartTime = startAt + buffer.duration;

        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(audioCtx.destination);
        scheduledCount += 1;
        src.onended = () => {
          endedCount += 1;
          maybeResolveDrain();
        };
        sources.push(src);
        try {
          src.start(startAt);
        } catch (_) {
          // ignore
        }
      };

      if (!playbackStarted && !ended) {
        if (queuedSamples < prebufferFrames * channels) return;
      }

      while (queuedSamples >= scheduleFrames * channels) {
        scheduleOne(scheduleFrames);
      }

      if (ended && queuedSamples > 0) {
        const remainingFrames = Math.floor(queuedSamples / channels);
        scheduleOne(Math.max(1, remainingFrames));
      }

      maybeResolveDrain();
    };

    const enqueuePcmChunk = (pcmBytes) => {
      if (!wavInfo) return;
      if (!audioCtx) return;
      if (wavInfo.bitsPerSample !== 16) throw new Error(`Unsupported bitsPerSample: ${wavInfo.bitsPerSample}`);

      const blockAlign = wavInfo.channels * 2;
      const usableBytes = pcmBytes.byteLength - (pcmBytes.byteLength % blockAlign);
      if (usableBytes <= 0) return;

      if (!firstAudioEmitted) {
        firstAudioEmitted = true;
        try {
          if (typeof onFirstAudioChunk === 'function') {
            onFirstAudioChunk({ bytes: usableBytes, sampleRate: wavInfo.sampleRate, channels: wavInfo.channels });
          }
        } catch (_) {
          // ignore
        }
      }

      const aligned = pcmBytes.slice(0, usableBytes);
      const int16 = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);

      if (!sanityDone && int16.length >= 4096) {
        const probeCount = Math.min(int16.length, wavInfo.sampleRate / 2);
        let peak = 0;
        let sumSq = 0;
        let zc = 0;
        let prev = int16[0];
        for (let i = 0; i < probeCount; i += wavInfo.channels) {
          const v = int16[i] / 32768;
          peak = Math.max(peak, Math.abs(v));
          sumSq += v * v;
          const cur = int16[i];
          if ((cur ^ prev) < 0) zc += 1;
          prev = cur;
        }
        const rms = Math.sqrt(sumSq / (probeCount / wavInfo.channels));
        const zcr = zc / (probeCount / wavInfo.channels);
        sanitySamples.push({ peak, rms, zcr });
        if (sanitySamples.length >= 2) {
          sanityDone = true;
          const avgRms = sanitySamples.reduce((a, b) => a + b.rms, 0) / sanitySamples.length;
          const avgZcr = sanitySamples.reduce((a, b) => a + b.zcr, 0) / sanitySamples.length;
          const avgPeak = sanitySamples.reduce((a, b) => a + b.peak, 0) / sanitySamples.length;
          console.log(`[TTS][Sanity] rms=${avgRms.toFixed(3)} zcr=${avgZcr.toFixed(3)} sr=${wavInfo.sampleRate}`);
          if (avgZcr > 0.35 && avgRms > 0.05) {
            throw new Error(`PCM sanity check failed (white-noise suspected): rms=${avgRms.toFixed(3)} zcr=${avgZcr.toFixed(3)}`);
          }
          // SD-4.3 abnormal audio detection: silence/clipping -> degrade to text-only.
          if (avgRms < 0.002 && avgPeak < 0.02) {
            throw new Error(`PCM sanity check failed (silence suspected): peak=${avgPeak.toFixed(3)} rms=${avgRms.toFixed(4)}`);
          }
          if (avgPeak > 0.98 && avgRms > 0.20) {
            throw new Error(`PCM sanity check failed (clipping suspected): peak=${avgPeak.toFixed(3)} rms=${avgRms.toFixed(3)}`);
          }
        }
      }

      const floats = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        floats[i] = int16[i] / 32768;
      }
      const resampled = resampleState ? resampleInterleaved(floats) : floats;
      if (resampled.length) {
        pcmQueue.push(resampled);
        queuedSamples += resampled.length;
      }
      scheduleAudioIfPossible();
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      let chunk = value;

      if (!wavInfo) {
        const merged = new Uint8Array(headerBuffer.byteLength + chunk.byteLength);
        merged.set(headerBuffer, 0);
        merged.set(chunk, headerBuffer.byteLength);
        headerBuffer = merged;

        if (headerBuffer.byteLength < 44) continue;
        if (headerBuffer.byteLength > 65536) throw new Error('WAV header too large');

        try {
          wavInfo = parseWavHeader(headerBuffer);
        } catch (e) {
          if (String(e && e.message).includes('no data chunk yet')) continue;
          throw e;
        }

        if (wavInfo.audioFormatCode !== 1) throw new Error(`Unsupported WAV audioFormat: ${wavInfo.audioFormatCode}`);
        await ensureAudioContext(wavInfo.sampleRate);
        ensureResampler();
        scheduleAudioIfPossible();

        const dataStart = wavInfo.dataOffset;
        if (headerBuffer.byteLength > dataStart) {
          const firstPcm = headerBuffer.slice(dataStart);
          const blockAlign = wavInfo.channels * 2;
          const usableBytes = firstPcm.byteLength - (firstPcm.byteLength % blockAlign);
          if (usableBytes > 0) {
            enqueuePcmChunk(firstPcm.slice(0, usableBytes));
          }
          const leftover = firstPcm.byteLength - usableBytes;
          if (leftover > 0) {
            pcmRemainder = firstPcm.slice(usableBytes);
          }
        }
        headerBuffer = new Uint8Array(0);
        continue;
      }

      if (pcmRemainder.byteLength) {
        const merged = new Uint8Array(pcmRemainder.byteLength + chunk.byteLength);
        merged.set(pcmRemainder, 0);
        merged.set(chunk, pcmRemainder.byteLength);
        pcmRemainder = new Uint8Array(0);
        chunk = merged;
      }

      if (
        chunk.byteLength >= 12 &&
        chunk[0] === 0x52 &&
        chunk[1] === 0x49 &&
        chunk[2] === 0x46 &&
        chunk[3] === 0x46 &&
        chunk[8] === 0x57 &&
        chunk[9] === 0x41 &&
        chunk[10] === 0x56 &&
        chunk[11] === 0x45
      ) {
        console.warn('[TTS] Detected embedded WAV header mid-stream; resetting parser');
        wavInfo = null;
        headerBuffer = chunk;
        pcmRemainder = new Uint8Array(0);
        sanitySamples = [];
        sanityDone = false;
        continue;
      }

      const blockAlign = wavInfo.channels * 2;
      const usableBytes = chunk.byteLength - (chunk.byteLength % blockAlign);
      if (usableBytes > 0) {
        enqueuePcmChunk(chunk.slice(0, usableBytes));
      }
      const leftover = chunk.byteLength - usableBytes;
      if (leftover > 0) {
        pcmRemainder = chunk.slice(usableBytes);
      }
    }

    ended = true;
    scheduleAudioIfPossible();
    await drainedPromise;
  } catch (err) {
    stopAllSources();
    if (abortController.signal.aborted) return;
    console.warn('[TTS] WebAudio streaming failed, trying decodeAudioData fallback:', err);
    try {
      await playWavViaDecodeAudioData(url, audioContextRef, currentAudioRef);
      return;
    } catch (decodeErr) {
      console.warn('[TTS] decodeAudioData fallback failed, trying <audio> fallback:', decodeErr);
      if (fallbackPlay) return fallbackPlay();
      throw decodeErr;
    }
  } finally {
    stopPlayback();
    stopAllSources();
  }
}

export const resampleMono = (input, inRate, outRate) => {
  if (!input || !input.length || !inRate || !outRate || inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input[idx] || 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] || 0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
};

export const encodeWavPcm16Mono = (samples, sampleRate) => {
  const n = samples.length;
  const bytesPerSample = 2;
  const dataSize = n * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate >>> 0, true);
  view.setUint32(28, (sampleRate * bytesPerSample) >>> 0, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize >>> 0, true);
  let offset = 44;
  for (let i = 0; i < n; i++) {
    let v = samples[i];
    if (v > 1) v = 1;
    if (v < -1) v = -1;
    const s = v < 0 ? v * 32768 : v * 32767;
    view.setInt16(offset, s, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
};

export const decodeAndConvertToWav16kMono = async (blob) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('WebAudio not supported');
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContextClass();
  try {
    const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
    const channels = audioBuffer.numberOfChannels || 1;
    const inRate = audioBuffer.sampleRate || 48000;
    const len = audioBuffer.length || 0;
    if (!len) throw new Error('decoded audio is empty');

    const mono = new Float32Array(len);
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
    }

    let peak = 0;
    for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
    const targetPeak = 0.85;
    const gain = peak > 1e-5 ? Math.min(20, targetPeak / peak) : 1.0;
    if (gain !== 1.0) {
      for (let i = 0; i < mono.length; i++) mono[i] = mono[i] * gain;
    }

    const outRate = 16000;
    const resampled = resampleMono(mono, inRate, outRate);
    const wavBytes = encodeWavPcm16Mono(resampled, outRate);
    return new Blob([wavBytes], { type: 'audio/wav' });
  } finally {
    try {
      ctx.close().catch(() => {});
    } catch (_) {
      // ignore
    }
  }
};

export const unlockAudio = (audioContextRef, preferredSampleRate) => {
  const AudioContextClass = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AudioContextClass) return;
  try {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = preferredSampleRate
          ? new AudioContextClass({ sampleRate: preferredSampleRate })
          : new AudioContextClass();
      } catch (_) {
        audioContextRef.current = new AudioContextClass();
      }
    }
    const audioCtx = audioContextRef.current;
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch((err) => console.warn('[audio] resume blocked:', err));
    }
    try {
      const buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      src.start(0);
      src.stop(0);
    } catch (_) {
      // ignore
    }
  } catch (err) {
    console.warn('[audio] unlock failed:', err);
  }
};
