import React, { useEffect, useState, useRef } from 'react';
import './App.css';

async function playWavViaDecodeAudioData(url, audioContextRef, currentAudioRef) {
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
    }
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

async function playWavBytesViaDecodeAudioData(wavBytes, audioContextRef, currentAudioRef) {
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
  const audioBuffer = await audioCtx.decodeAudioData(
    patched.buffer.slice(patched.byteOffset, patched.byteOffset + patched.byteLength)
  );

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

async function playWavStreamViaWebAudio(url, audioContextRef, currentAudioRef, fallbackPlay, onFirstAudioChunk) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    if (fallbackPlay) return fallbackPlay();
    throw new Error('WebAudio is not supported');
  }

  const abortController = new AbortController();
  let audioCtx = null;
  let processor = null;
  let processorChannels = null;
  let pcmQueue = [];
  let pcmQueueIndex = 0;
  let pcmQueueOffset = 0;
  let ended = false;
  let drainedResolver = null;
  let drainedPromise = new Promise((resolve) => (drainedResolver = resolve));

  const stopPlayback = () => {
    try {
      abortController.abort();
    } catch (_) {
      // ignore
    }
    try {
      if (processor) processor.disconnect();
    } catch (_) {
      // ignore
    }
    try {
      if (drainedResolver) drainedResolver();
    } catch (_) {
      // ignore
    }
  };

  currentAudioRef.current = { stop: stopPlayback };

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
    let sanitySamples = [];
    let sanityDone = false;
    let warnedRateMismatch = false;
    let resampleState = null;
    let firstAudioEmitted = false;

    const ensureAudioContext = async (targetSampleRate) => {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContextClass({ sampleRate: targetSampleRate });
        } catch (_) {
          // Fallback: let browser pick the hardware sample rate (will resample internally).
          audioContextRef.current = new AudioContextClass();
        }
      }
      audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (err) {
          console.warn('[audio] resume blocked:', err);
        }
      }
    };

    const ensureProcessor = () => {
      if (!audioCtx || !wavInfo) return;
      if (processor) return;
      const bufferSize = 2048;
      processor = audioCtx.createScriptProcessor(bufferSize, 0, wavInfo.channels);
      processorChannels = wavInfo.channels;
      processor.onaudioprocess = (e) => {
        const frames = e.outputBuffer.length;
        const channels = wavInfo.channels;

        for (let ch = 0; ch < channels; ch++) {
          const out = e.outputBuffer.getChannelData(ch);
          out.fill(0);
        }

        let framesWritten = 0;
        while (framesWritten < frames) {
          if (pcmQueueIndex >= pcmQueue.length) break;
          const chunk = pcmQueue[pcmQueueIndex];
          const chunkFrames = chunk.length / channels;
          const availableFrames = chunkFrames - pcmQueueOffset;
          if (availableFrames <= 0) {
            pcmQueueIndex += 1;
            pcmQueueOffset = 0;
            continue;
          }
          const toCopy = Math.min(frames - framesWritten, availableFrames);

          for (let ch = 0; ch < channels; ch++) {
            const out = e.outputBuffer.getChannelData(ch);
            for (let i = 0; i < toCopy; i++) {
              out[framesWritten + i] = chunk[(pcmQueueOffset + i) * channels + ch];
            }
          }

          pcmQueueOffset += toCopy;
          framesWritten += toCopy;
        }

        if (ended && pcmQueueIndex >= pcmQueue.length) {
          try {
            processor.disconnect();
          } catch (_) {
            // ignore
          }
          processor = null;
          if (drainedResolver) drainedResolver();
          drainedResolver = null;
        }
      };
      processor.connect(audioCtx.destination);
    };

    const ensureResampler = () => {
      if (!audioCtx || !wavInfo) return;
      if (audioCtx.sampleRate === wavInfo.sampleRate) {
        resampleState = null;
        return;
      }
      if (!warnedRateMismatch) {
        warnedRateMismatch = true;
        console.warn(
          `[TTS] sampleRate mismatch: wav=${wavInfo.sampleRate}Hz audioCtx=${audioCtx.sampleRate}Hz; enabling resampler`
        );
      }
      if (resampleState) return;
      resampleState = {
        channels: wavInfo.channels,
        srcRate: wavInfo.sampleRate,
        dstRate: audioCtx.sampleRate,
        step: wavInfo.sampleRate / audioCtx.sampleRate,
        srcPos: 0,
        carry: new Float32Array(0),
      };
    };

    const resampleInterleaved = (inputInterleaved) => {
      if (!resampleState) return inputInterleaved;
      const { channels, step } = resampleState;
      const carry = resampleState.carry;
      const merged = new Float32Array(carry.length + inputInterleaved.length);
      merged.set(carry, 0);
      merged.set(inputInterleaved, carry.length);

      const totalFrames = merged.length / channels;
      let srcPos = resampleState.srcPos;
      if (totalFrames < 2) {
        resampleState.carry = merged;
        resampleState.srcPos = srcPos;
        return new Float32Array(0);
      }

      const out = [];
      while (srcPos + 1 < totalFrames) {
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
        // Probe first ~0.25s audio to detect obvious "white noise" decoding issues.
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
          console.log(`[TTS][Sanity] rms=${avgRms.toFixed(3)} zcr=${avgZcr.toFixed(3)} sr=${wavInfo.sampleRate}`);
          if (avgZcr > 0.35 && avgRms > 0.05) {
            throw new Error(`PCM sanity check failed (white-noise suspected): rms=${avgRms.toFixed(3)} zcr=${avgZcr.toFixed(3)}`);
          }
        }
      }

      // Convert to interleaved float32 (matches ScriptProcessor fill loop)
      const floats = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        floats[i] = int16[i] / 32768;
      }
      const resampled = resampleState ? resampleInterleaved(floats) : floats;
      if (resampled.length) pcmQueue.push(resampled);
      ensureProcessor();
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
          // Keep buffering until "data" chunk is present.
          if (String(e && e.message).includes('no data chunk yet')) continue;
          throw e;
        }

        if (wavInfo.audioFormatCode !== 1) throw new Error(`Unsupported WAV audioFormat: ${wavInfo.audioFormatCode}`);
        if (processor && processorChannels != null && processorChannels !== wavInfo.channels) {
          throw new Error(`WAV channel count changed mid-stream: ${processorChannels} -> ${wavInfo.channels}`);
        }
        await ensureAudioContext(wavInfo.sampleRate);
        ensureResampler();
        ensureProcessor();

        const dataStart = wavInfo.dataOffset;
        if (headerBuffer.byteLength > dataStart) {
          // The very first PCM bytes may be cut mid-sample depending on network chunk boundaries.
          // Use the same blockAlign/remainder logic to avoid dropping 1 byte and shifting all samples (white-noise).
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

      // Some TTS providers may send each websocket frame as a standalone WAV (RIFF header repeated).
      // Detect and reset parser to avoid treating RIFF bytes as PCM (white noise).
      if (
        chunk.byteLength >= 12 &&
        chunk[0] === 0x52 && // R
        chunk[1] === 0x49 && // I
        chunk[2] === 0x46 && // F
        chunk[3] === 0x46 && // F
        chunk[8] === 0x57 && // W
        chunk[9] === 0x41 && // A
        chunk[10] === 0x56 && // V
        chunk[11] === 0x45 // E
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

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [inputText, setInputText] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [debugInfo, setDebugInfo] = useState(null);
  const [chatOptions, setChatOptions] = useState([]);
  const [selectedChat, setSelectedChat] = useState('展厅聊天');
  const [agentOptions, setAgentOptions] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [useAgentMode, setUseAgentMode] = useState(false);
  const [guideEnabled, setGuideEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('guideEnabled');
      return v == null ? true : v === '1';
    } catch (_) {
      return true;
    }
  });
  const [continuousTour, setContinuousTour] = useState(() => {
    try {
      return localStorage.getItem('continuousTour') === '1';
    } catch (_) {
      return false;
    }
  });
  const [guideDuration, setGuideDuration] = useState(() => {
    try {
      return localStorage.getItem('guideDuration') || '60';
    } catch (_) {
      return '60';
    }
  });
  const [guideStyle, setGuideStyle] = useState(() => {
    try {
      return localStorage.getItem('guideStyle') || 'friendly';
    } catch (_) {
      return 'friendly';
    }
  });
  const [historySort, setHistorySort] = useState('time'); // 'time' | 'count'
  const [historyItems, setHistoryItems] = useState([]);
  const [clientId] = useState(() => {
    try {
      const existing = localStorage.getItem('clientId');
      if (existing) return existing;
      const next =
        (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`);
      localStorage.setItem('clientId', next);
      return next;
    } catch (_) {
      return `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  });
  const [tourStops, setTourStops] = useState([]);
  const [tourStopDurations, setTourStopDurations] = useState([]); // aligned with tourStops
  const [tourStopTargetChars, setTourStopTargetChars] = useState([]); // aligned with tourStops
  const [tourState, setTourState] = useState({
    mode: 'idle', // 'idle' | 'ready' | 'running' | 'interrupted'
    stopIndex: -1,
    stopName: '',
    lastAnswerTail: '',
    lastAction: null, // 'start' | 'continue' | 'next' | 'user_question' | 'interrupt'
  });
  const [tourMeta, setTourMeta] = useState({
    zones: ['默认路线'],
    profiles: ['大众', '儿童', '专业'],
    default_zone: '默认路线',
    default_profile: '大众',
  });
  const [tourZone, setTourZone] = useState(() => {
    try {
      return localStorage.getItem('tourZone') || '';
    } catch (_) {
      return '';
    }
  });
  const [audienceProfile, setAudienceProfile] = useState(() => {
    try {
      return localStorage.getItem('audienceProfile') || '';
    } catch (_) {
      return '';
    }
  });
  const [groupMode, setGroupMode] = useState(() => {
    try {
      return localStorage.getItem('groupMode') === '1';
    } catch (_) {
      return false;
    }
  });
  const [speakerName, setSpeakerName] = useState(() => {
    try {
      return localStorage.getItem('speakerName') || '观众A';
    } catch (_) {
      return '观众A';
    }
  });
  const [questionPriority, setQuestionPriority] = useState('normal'); // 'normal' | 'high'
  const [questionQueue, setQuestionQueue] = useState([]);
  const [currentIntent, setCurrentIntent] = useState(null);
  const [tourSelectedStopIndex, setTourSelectedStopIndex] = useState(() => {
    try {
      const raw = localStorage.getItem('tourSelectedStopIndex');
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch (_) {
      return 0;
    }
  });
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);
  const PREFERRED_TTS_SAMPLE_RATE = 16000;
  const ttsEnabledRef = useRef(true);
  const continuousTourRef = useRef(continuousTour);
  const debugRef = useRef(null);
  const segmentSeqRef = useRef(0);
  const askAbortRef = useRef(null);
  const tourStateRef = useRef(tourState);
  const tourStopDurationsRef = useRef(tourStopDurations);
  const tourStopTargetCharsRef = useRef(tourStopTargetChars);
  const clientIdRef = useRef(clientId);
  const activeAskRequestIdRef = useRef(null);
  const groupModeRef = useRef(groupMode);
  const queueRef = useRef([]);
  const lastSpeakerRef = useRef('');

  // 原始文本队列和预生成音频队列
  const ttsTextQueueRef = useRef([]);
  const ttsMetaQueueRef = useRef([]);
  const ttsAudioQueueRef = useRef([]);
  const seenTtsSegmentsRef = useRef(new Set());
  const prefetchAbortRef = useRef(null);
  const prefetchStoreRef = useRef(new Map()); // stopIndex -> { segments: [{ text, wavBytes }], createdAt }
  const continuousActiveRef = useRef(false);
  const continuousTokenRef = useRef(0);

  // 工作线程引用
  const ttsGeneratorPromiseRef = useRef(null);
  const ttsPlayerPromiseRef = useRef(null);

  const ragflowDoneRef = useRef(false);
  const runIdRef = useRef(0);
  const currentAudioRef = useRef(null);
  const receivedSegmentsRef = useRef(false);
  const audioContextRef = useRef(null);
  const USE_SAVED_TTS = false;
  const recordStreamRef = useRef(null);
  const recordPointerIdRef = useRef(null);
  const recordStartMsRef = useRef(0);
  const recordCanceledRef = useRef(false);
  const inputElRef = useRef(null);

  const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  const POINTER_SUPPORTED = typeof window !== 'undefined' && 'PointerEvent' in window;
  const MIN_RECORD_MS = 900;

  const abortPrefetch = (reason) => {
    const ctl = prefetchAbortRef.current;
    prefetchAbortRef.current = null;
    if (!ctl) return;
    try {
      ctl.abort();
      console.log('[PREFETCH] aborted', reason || 'unknown');
    } catch (_) {
      // ignore
    }
  };

  const cancelBackendRequest = (requestId, reason) => {
    const rid = String(requestId || '').trim();
    if (!rid) return;
    const payload = JSON.stringify({ request_id: rid, client_id: clientIdRef.current, reason: String(reason || 'client_cancel') });
    try {
      if (navigator && typeof navigator.sendBeacon === 'function') {
        const ok = navigator.sendBeacon('http://localhost:8000/api/cancel', new Blob([payload], { type: 'application/json' }));
        if (ok) return;
      }
    } catch (_) {
      // ignore
    }
    try {
      fetch('http://localhost:8000/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-ID': clientIdRef.current },
        body: payload
      }).catch(() => {});
    } catch (_) {
      // ignore
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e || e.key !== 'Escape') return;
      const hasActiveRun =
        !!askAbortRef.current ||
        isLoading ||
        !!ttsGeneratorPromiseRef.current ||
        !!ttsPlayerPromiseRef.current ||
        !!currentAudioRef.current;
      if (!hasActiveRun) return;
      try {
        e.preventDefault();
      } catch (_) {
        // ignore
      }
      interruptCurrentRun('escape');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLoading]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const resampleMono = (input, inRate, outRate) => {
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

  const encodeWavPcm16Mono = (samples, sampleRate) => {
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

  const decodeAndConvertToWav16kMono = async (blob) => {
    if (!AudioContextClass) throw new Error('WebAudio not supported');
    const ab = await blob.arrayBuffer();
    const ctx = new AudioContextClass();
    try {
      const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
      const channels = audioBuffer.numberOfChannels || 1;
      const inRate = audioBuffer.sampleRate || 48000;
      const len = audioBuffer.length || 0;
      if (!len) throw new Error('decoded audio is empty');

      // Mix down to mono
      const mono = new Float32Array(len);
      for (let ch = 0; ch < channels; ch++) {
        const data = audioBuffer.getChannelData(ch);
        for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
      }

      // Normalize peak (helps low-volume recordings)
      let peak = 0;
      for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
      const targetPeak = 0.85;
      const gain = peak > 1e-5 ? Math.min(20, targetPeak / peak) : 1.0;
      if (gain !== 1.0) {
        for (let i = 0; i < mono.length; i++) mono[i] = mono[i] * gain;
      }

      // Resample to 16k
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

  const unlockAudio = () => {
    if (!AudioContextClass) return;
    try {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContextClass({ sampleRate: PREFERRED_TTS_SAMPLE_RATE });
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

  useEffect(() => {
    ttsEnabledRef.current = !!ttsEnabled;

    if (!ttsEnabled) {
      try {
        if (currentAudioRef.current) {
          if (typeof currentAudioRef.current.stop === 'function') {
            currentAudioRef.current.stop();
          } else if (typeof currentAudioRef.current.pause === 'function') {
            currentAudioRef.current.pause();
            currentAudioRef.current.src = '';
          }
        }
      } catch (_) {
        // ignore
      } finally {
      currentAudioRef.current = null;
      }

      ttsTextQueueRef.current = [];
      ttsMetaQueueRef.current = [];
      ttsAudioQueueRef.current = [];
      ragflowDoneRef.current = true;
      ttsGeneratorPromiseRef.current = null;
      ttsPlayerPromiseRef.current = null;
      setQueueStatus('');
    }
  }, [ttsEnabled]);

  useEffect(() => {
    continuousTourRef.current = !!continuousTour;
    try {
      localStorage.setItem('continuousTour', continuousTour ? '1' : '0');
    } catch (_) {
      // ignore
    }
  }, [continuousTour]);

  useEffect(() => {
    try {
      localStorage.setItem('guideEnabled', guideEnabled ? '1' : '0');
      localStorage.setItem('guideDuration', String(guideDuration || '60'));
      localStorage.setItem('guideStyle', String(guideStyle || 'friendly'));
    } catch (_) {
      // ignore
    }
  }, [guideEnabled, guideDuration, guideStyle]);

  useEffect(() => {
    tourStateRef.current = tourState;
  }, [tourState]);

  useEffect(() => {
    tourStopDurationsRef.current = Array.isArray(tourStopDurations) ? tourStopDurations : [];
  }, [tourStopDurations]);

  useEffect(() => {
    tourStopTargetCharsRef.current = Array.isArray(tourStopTargetChars) ? tourStopTargetChars : [];
  }, [tourStopTargetChars]);

  useEffect(() => {
    groupModeRef.current = !!groupMode;
    try {
      localStorage.setItem('groupMode', groupMode ? '1' : '0');
    } catch (_) {
      // ignore
    }
  }, [groupMode]);

  useEffect(() => {
    try {
      localStorage.setItem('speakerName', String(speakerName || '观众A'));
    } catch (_) {
      // ignore
    }
  }, [speakerName]);

  useEffect(() => {
    try {
      localStorage.setItem('tourZone', String(tourZone || ''));
      localStorage.setItem('audienceProfile', String(audienceProfile || ''));
    } catch (_) {
      // ignore
    }
  }, [tourZone, audienceProfile]);

  useEffect(() => {
    queueRef.current = Array.isArray(questionQueue) ? questionQueue : [];
  }, [questionQueue]);

  useEffect(() => {
    try {
      localStorage.setItem('tourSelectedStopIndex', String(tourSelectedStopIndex));
    } catch (_) {
      // ignore
    }
  }, [tourSelectedStopIndex]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tourStateV1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      setTourState((prev) => ({
        ...prev,
        mode: typeof parsed.mode === 'string' ? parsed.mode : prev.mode,
        stopIndex: Number.isFinite(parsed.stopIndex) ? parsed.stopIndex : prev.stopIndex,
        stopName: typeof parsed.stopName === 'string' ? parsed.stopName : prev.stopName,
        lastAnswerTail: typeof parsed.lastAnswerTail === 'string' ? parsed.lastAnswerTail : prev.lastAnswerTail,
        lastAction: typeof parsed.lastAction === 'string' ? parsed.lastAction : prev.lastAction,
      }));
    } catch (_) {
      // ignore
    }
    // only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'tourStateV1',
        JSON.stringify({
          mode: tourState.mode,
          stopIndex: tourState.stopIndex,
          stopName: tourState.stopName,
          lastAnswerTail: tourState.lastAnswerTail,
          lastAction: tourState.lastAction,
        })
      );
    } catch (_) {
      // ignore
    }
  }, [tourState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const metaResp = await fetch('http://localhost:8000/api/tour/meta');
        const meta = await metaResp.json();
        if (cancelled) return;
        if (meta && typeof meta === 'object') {
          setTourMeta(meta);
          const zones = Array.isArray(meta.zones) ? meta.zones : [];
          const profiles = Array.isArray(meta.profiles) ? meta.profiles : [];
          setTourZone((prev) => (prev ? prev : String(meta.default_zone || zones[0] || '默认路线')));
          setAudienceProfile((prev) => (prev ? prev : String(meta.default_profile || profiles[0] || '大众')));
        }

        const resp = await fetch('http://localhost:8000/api/tour/stops');
        const data = await resp.json();
        if (cancelled) return;
        const stops = Array.isArray(data && data.stops) ? data.stops.map((s) => String(s || '').trim()).filter(Boolean) : [];
        setTourStops(stops);
        if (stops.length) {
          setTourSelectedStopIndex((prev) => {
            const n = Number(prev);
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(n, stops.length - 1));
          });
        }
      } catch (_) {
        if (!cancelled) setTourStops([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getTourStopName = (index) => {
    const stops = Array.isArray(tourStops) ? tourStops : [];
    if (!stops.length) return '';
    const i = Math.max(0, Math.min(Number(index) || 0, stops.length - 1));
    return String(stops[i] || '').trim();
  };

  const buildTourPrompt = (action, stopIndex, tailOverride) => {
    const idx = Number.isFinite(stopIndex) ? stopIndex : 0;
    const stopName = getTourStopName(idx);
    const n = Array.isArray(tourStops) ? tourStops.length : 0;
    const title = stopName ? `第${idx + 1}站「${stopName}」` : `第${idx + 1}站`;
    const suffix = n ? `（共${n}站）` : '';
    const tail =
      tailOverride != null ? String(tailOverride || '').trim() : String((tourStateRef.current && tourStateRef.current.lastAnswerTail) || '').trim();
    const tailHint = tail ? `\n\n【上一段结束语（供承接）】${tail}` : '';
    const profile = String(audienceProfile || '').trim();
    const profileHint = profile ? `\n\n【人群画像】${profile}` : '';

    const durs = tourStopDurationsRef.current || [];
    const targets = tourStopTargetCharsRef.current || [];
    const dur =
      Number.isFinite(Number(durs[idx])) && Number(durs[idx]) > 0 ? Number(durs[idx]) : Math.max(15, Number(guideDuration || 60) || 60);
    const targetChars = Number.isFinite(Number(targets[idx])) && Number(targets[idx]) > 0 ? Number(targets[idx]) : Math.max(30, Math.round(dur * 4.5));
    const durHint = `\n\n【本站讲解时长】约${dur}秒（建议总字数约${targetChars}字，按中文语速估算）`;
    if (action === 'start') {
      return `请开始展厅讲解：从${title}${suffix}开始，先给出1-2句开场白，再分点讲解本站重点。${durHint}${profileHint}`;
    }
    if (action === 'continue') {
      return `继续讲解${title}${suffix}：承接上一段内容，补充关键细节与示例，保持短句分段。${durHint}${tailHint}${profileHint}`;
    }
    if (action === 'next') {
      return `现在进入${title}${suffix}：请开始讲解，先概括本站主题，再分点说明。${durHint}${tailHint}${profileHint}`;
    }
    return '继续讲解';
  };

  const prefetchTourStopFirstSegment = async ({ stopIndex, tail, token }) => {
    const idx = Number.isFinite(stopIndex) ? stopIndex : 0;
    const stops = Array.isArray(tourStops) ? tourStops : [];
    if (!stops.length || idx < 0 || idx >= stops.length) return;
    if (!ttsEnabledRef.current) return;
    if (!continuousTourRef.current) return;
    if (continuousActiveRef.current !== true) return;

    // If already cached, skip.
    if (prefetchStoreRef.current.has(idx)) return;

    abortPrefetch('replace');
    const ctl = new AbortController();
    prefetchAbortRef.current = ctl;

    const prefetchAskId = `ask_prefetch_${token}_${idx}_${Date.now()}`;
    const prompt = buildTourPrompt('next', idx, tail);

    console.log('[PREFETCH] start', `stopIndex=${idx}`, `askId=${prefetchAskId}`);

    try {
      const resp = await fetch('http://localhost:8000/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': clientIdRef.current,
          'X-Request-ID': prefetchAskId,
        },
        body: JSON.stringify({
          question: prompt,
          request_id: prefetchAskId,
          client_id: clientIdRef.current,
          kind: 'ask_prefetch',
          conversation_name: useAgentMode ? null : selectedChat,
          agent_id: useAgentMode ? (selectedAgentId || null) : null,
          guide: {
            enabled: !!guideEnabled,
            duration_s: Number(guideDuration || 60),
            style: String(guideStyle || 'friendly'),
          },
        }),
        signal: ctl.signal,
      });

      if (!resp.ok || !resp.body) throw new Error(`prefetch /api/ask http=${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let firstSegText = '';

      while (true) {
        if (ctl.signal.aborted) break;
        if (!continuousActiveRef.current || continuousTokenRef.current !== token) break;
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = String(line || '').trim();
          if (!trimmed.startsWith('data: ')) continue;
          let data = null;
          try {
            data = JSON.parse(trimmed.slice(6));
          } catch (_) {
            continue;
          }
          if (data && data.segment && !data.done) {
            const seg = String(data.segment || '').trim();
            if (seg) {
              firstSegText = seg;
              break;
            }
          }
        }
        if (firstSegText) break;
      }

      if (!firstSegText || ctl.signal.aborted) return;

      const ttsId = `tts_prefetch_${token}_${idx}_${Date.now()}`;
      const ttsUrl = new URL('http://localhost:8000/api/text_to_speech_stream');
      ttsUrl.searchParams.set('text', firstSegText);
      ttsUrl.searchParams.set('request_id', ttsId);
      ttsUrl.searchParams.set('client_id', clientIdRef.current);
      ttsUrl.searchParams.set('segment_index', '0');

      const ttsResp = await fetch(ttsUrl.toString(), {
        method: 'GET',
        headers: { 'X-Client-ID': clientIdRef.current, 'X-Request-ID': ttsId },
        signal: ctl.signal,
      });
      if (!ttsResp.ok) throw new Error(`prefetch tts http=${ttsResp.status}`);
      const wavBytes = new Uint8Array(await ttsResp.arrayBuffer());

      if (ctl.signal.aborted) return;
      if (!continuousActiveRef.current || continuousTokenRef.current !== token) return;

      prefetchStoreRef.current.set(idx, { segments: [{ text: firstSegText, wavBytes }], createdAt: Date.now() });
      console.log('[PREFETCH] ready', `stopIndex=${idx}`, `bytes=${wavBytes.byteLength}`);
    } catch (e) {
      if (ctl.signal.aborted || String(e && e.name) === 'AbortError') return;
      console.warn('[PREFETCH] failed', e);
    } finally {
      if (prefetchAbortRef.current === ctl) prefetchAbortRef.current = null;
    }
  };

  const enqueueQuestion = ({ speaker, text, priority }) => {
    const item = {
      id: `q_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      speaker: String(speaker || '观众').trim() || '观众',
      text: String(text || '').trim(),
      priority: priority === 'high' ? 'high' : 'normal',
      ts: Date.now(),
    };
    if (!item.text) return null;
    const next = [...(queueRef.current || []), item];
    queueRef.current = next;
    setQuestionQueue(next);
    return item;
  };

  const removeQueuedQuestion = (id) => {
    const next = (queueRef.current || []).filter((q) => q && q.id !== id);
    queueRef.current = next;
    setQuestionQueue(next);
  };

  const pickNextQueuedQuestion = () => {
    const q = queueRef.current || [];
    if (!q.length) return null;
    const highs = q.filter((x) => x && x.priority === 'high');
    const pool = highs.length ? highs : q;
    const last = String(lastSpeakerRef.current || '');
    const diff = pool.find((x) => String(x.speaker || '') !== last) || pool[0];
    if (!diff) return null;
    return diff;
  };

  const maybeStartNextQueuedQuestion = async () => {
    if (!groupModeRef.current) return;
    if (continuousActiveRef.current) return;
    if (isLoading || askAbortRef.current || ttsGeneratorPromiseRef.current || ttsPlayerPromiseRef.current) return;
    const next = pickNextQueuedQuestion();
    if (!next) return;
    removeQueuedQuestion(next.id);
    lastSpeakerRef.current = String(next.speaker || '');
    const prefixed = `【提问人：${String(next.speaker || '').trim() || '观众'}】${next.text}`;
    try {
      beginDebugRun(next.priority === 'high' ? 'group_high' : 'group_next');
      await askQuestion(prefixed, { fromQueue: true });
    } catch (e) {
      console.error('[QUEUE] auto ask failed', e);
    }
  };

  const answerQueuedNow = async (item) => {
    if (!item || !item.id) return;
    try {
      removeQueuedQuestion(item.id);
      lastSpeakerRef.current = String(item.speaker || '');
      const prefixed = `【提问人：${String(item.speaker || '').trim() || '观众'}】${String(item.text || '').trim()}`;
      const active =
        !!askAbortRef.current || isLoading || !!ttsGeneratorPromiseRef.current || !!ttsPlayerPromiseRef.current || !!currentAudioRef.current;
      if (active) interruptCurrentRun('queue_takeover');
      beginDebugRun(item.priority === 'high' ? 'group_high' : 'group_takeover');
      await askQuestion(prefixed, { fromQueue: true });
    } catch (e) {
      console.error('[QUEUE] takeover failed', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('http://localhost:8000/api/ragflow/chats');
        const data = await resp.json();
        if (cancelled) return;
        const chats = Array.isArray(data && data.chats) ? data.chats : [];
        const names = chats.map((c) => (c && c.name ? String(c.name) : '')).filter(Boolean);
        setChatOptions(names);
        const defName = (data && data.default ? String(data.default) : '').trim();
        if (defName && names.includes(defName)) {
          setSelectedChat(defName);
        } else if (names.includes('展厅聊天')) {
          setSelectedChat('展厅聊天');
        } else if (names.length > 0) {
          setSelectedChat(names[0]);
        }
      } catch (e) {
        // fallback to default
        if (!cancelled) setChatOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchHistory = async (sortMode) => {
    try {
      const sort = (sortMode || historySort || 'time').trim();
      const resp = await fetch(`http://localhost:8000/api/history?sort=${encodeURIComponent(sort)}&limit=200`);
      const data = await resp.json();
      const items = Array.isArray(data && data.items) ? data.items : [];
      setHistoryItems(items);
    } catch (_) {
      setHistoryItems([]);
    }
  };

  useEffect(() => {
    fetchHistory(historySort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySort]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('http://localhost:8000/api/ragflow/agents');
        const data = await resp.json();
        if (cancelled) return;
        const agents = Array.isArray(data && data.agents) ? data.agents : [];
        setAgentOptions(agents);
        const defId = (data && data.default ? String(data.default) : '').trim();
        if (defId && agents.some((a) => String(a && a.id) === defId)) {
          setSelectedAgentId(defId);
        } else {
          setSelectedAgentId('');
        }
      } catch (e) {
        if (!cancelled) setAgentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  const beginDebugRun = (trigger) => {
    const t0 = nowMs();
    const next = {
      trigger,
      submitAt: t0,
      ragflowFirstChunkAt: null,
      ragflowFirstSegmentAt: null,
      ragflowDoneAt: null,
      ttsFirstRequestAt: null,
      ttsFirstAudioAt: null,
      ttsAllDoneAt: null,
      segments: [],
    };
    debugRef.current = next;
    setDebugInfo(next);
  };

  const debugMark = (key, t) => {
    const cur = debugRef.current;
    if (!cur) return;
    if (cur[key] != null) return;
    cur[key] = t != null ? t : nowMs();
    setDebugInfo({ ...cur, segments: [...cur.segments] });
  };

  const debugRefresh = () => {
    const cur = debugRef.current;
    if (!cur) return;
    setDebugInfo({ ...cur, segments: [...cur.segments] });
  };

  // TTS预生成配置
  const MAX_PRE_GENERATE_COUNT = 2; // 最多预生成2段音频

  // 更新队列状态显示
  const updateQueueStatus = () => {
    const textCount = ttsTextQueueRef.current.length;
    const audioCount = ttsAudioQueueRef.current.length;
    const generatorRunning = !!ttsGeneratorPromiseRef.current;
    const playerRunning = !!ttsPlayerPromiseRef.current;

    setQueueStatus(
      `📝待生成: ${textCount} | 🔊预生成: ${audioCount} | ` +
      `${generatorRunning ? '🎵生成中' : '⏸️生成空闲'} | ` +
      `${playerRunning ? '🔊播放中' : '⏸️播放空闲'}`
    );
  };

  // 启动队列状态监控
  const startStatusMonitor = (runId) => {
    const interval = setInterval(() => {
      if (runIdRef.current === runId && (isLoading || ttsGeneratorPromiseRef.current || ttsPlayerPromiseRef.current)) {
        updateQueueStatus();
      } else {
        setQueueStatus('');
        clearInterval(interval);
      }
    }, 200); // 每200ms更新一次状态
  };

  const startRecording = async () => {
    try {
      if (isRecording) return;
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        console.error('[REC] getUserMedia not supported');
        alert('当前浏览器不支持麦克风录音（getUserMedia 不可用）');
        return;
      }
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        console.error('[REC] insecure context, microphone blocked');
        alert('浏览器限制：非安全环境无法使用麦克风。请使用 https 或通过 localhost/127.0.0.1 访问页面。');
        return;
      }
      unlockAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordStartMsRef.current = Date.now();
      recordCanceledRef.current = false;

      let mimeType = '';
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
      ];
      for (const c of candidates) {
        try {
          if (window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(c)) {
            mimeType = c;
            break;
          }
        } catch (_) {
          // ignore
        }
      }

      let mediaRecorder;
      try {
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (e) {
        console.error('[REC] MediaRecorder init failed', e);
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        alert('初始化录音失败：当前浏览器不支持 MediaRecorder 或音频编码格式。');
        return;
      }
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event && event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const dt = Date.now() - (recordStartMsRef.current || Date.now());
        const chunks = audioChunksRef.current || [];
        const blobType = (mimeType || (mediaRecorder && mediaRecorder.mimeType) || 'application/octet-stream').split(';')[0];
        const audioBlob = new Blob(chunks, { type: blobType });
        const s = recordStreamRef.current;
        recordStreamRef.current = null;
        try {
          if (s) s.getTracks().forEach((track) => track.stop());
        } catch (_) {
          // ignore
        }
        if (recordCanceledRef.current) {
          console.warn(`[REC] canceled, drop blob type=${audioBlob.type} bytes=${audioBlob.size} dt=${dt}ms`);
          recordCanceledRef.current = false;
          return;
        }
        if (dt < MIN_RECORD_MS) {
          console.warn(`[REC] too short, drop blob type=${audioBlob.type} bytes=${audioBlob.size} dt=${dt}ms`);
          alert('录音太短，请按住说话 1 秒以上');
          return;
        }
        if (!audioBlob || audioBlob.size <= 0) {
          console.warn('[REC] empty audio blob, skip');
          return;
        }
        console.log(`[REC] recorded blob type=${audioBlob.type} bytes=${audioBlob.size}`);
        await processAudio(audioBlob, { mimeType: audioBlob.type });
      };

      // Emit data periodically to avoid "no data for short press" issues on some browsers.
      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    if (mediaRecorderRef.current) {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
      unlockAudio();
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          // Force flush any buffered data before stop.
          if (typeof mediaRecorderRef.current.requestData === 'function') {
            try {
              mediaRecorderRef.current.requestData();
            } catch (_) {
              // ignore
            }
          }
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.error('[REC] stop failed', e);
      }
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob, meta = {}) => {
    setIsLoading(true);
    try {
      let blobToSend = audioBlob;
      // Convert MediaRecorder formats (webm/ogg/mp4) to WAV16k mono to improve ASR reliability.
      const ct = String(meta.mimeType || audioBlob.type || '').toLowerCase();
      if (ct.includes('webm') || ct.includes('ogg') || ct.includes('mp4')) {
        try {
          const wav = await decodeAndConvertToWav16kMono(audioBlob);
          console.log(`[REC] converted_to_wav bytes=${wav.size}`);
          blobToSend = wav;
        } catch (e) {
          console.warn('[REC] decode/convert failed, sending original blob:', e);
          blobToSend = audioBlob;
        }
      }

      const formData = new FormData();
      const sendType = String(blobToSend.type || '').toLowerCase();
      const ext = sendType.includes('wav')
        ? 'wav'
        : ct.includes('ogg')
          ? 'ogg'
          : ct.includes('mp4')
            ? 'mp4'
            : 'webm';
      formData.append('audio', blobToSend, `recording.${ext}`);
      formData.append('client_id', clientIdRef.current);
      formData.append('request_id', `asr_${Date.now()}_${Math.random().toString(16).slice(2)}`);

      const response = await fetch('http://localhost:8000/api/speech_to_text', {
        method: 'POST',
        headers: { 'X-Client-ID': clientIdRef.current },
        body: formData
      });

      const result = await response.json();
      const text = result.text || '';

      if (text) {
        console.log(`[REC] asr_text chars=${text.length} preview="${text.slice(0, 30)}"`);
        setInputText((prev) => {
          const p = String(prev || '').trim();
          const t = String(text || '').trim();
          if (!t) return p;
          return p ? `${p} ${t}` : t;
        });
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error processing audio:', err);
      setIsLoading(false);
    }
  };

  const onRecordPointerDown = async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {
      // ignore
    }
    if (recordPointerIdRef.current != null) return;
    recordPointerIdRef.current = e && e.pointerId != null ? e.pointerId : 'mouse';
    console.log('[REC] pointerdown', recordPointerIdRef.current);
    try {
      if (e && e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function' && e.pointerId != null) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    } catch (_) {
      // ignore
    }
    await startRecording();
  };

  const onRecordPointerUp = (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {
      // ignore
    }
    const pid = e && e.pointerId != null ? e.pointerId : 'mouse';
    if (recordPointerIdRef.current != null && recordPointerIdRef.current !== pid) return;
    console.log('[REC] pointerup', pid);
    recordPointerIdRef.current = null;
    stopRecording();
  };

  const onRecordPointerCancel = () => {
    console.log('[REC] pointercancel');
    recordCanceledRef.current = true;
    recordPointerIdRef.current = null;
    stopRecording();
  };

  const interruptCurrentRun = (reason) => {
    continuousActiveRef.current = false;
    continuousTokenRef.current += 1;
    try {
      prefetchStoreRef.current.clear();
    } catch (_) {
      // ignore
    }
    abortPrefetch('interrupt');
    try {
      if (activeAskRequestIdRef.current) {
        cancelBackendRequest(activeAskRequestIdRef.current, reason || 'interrupt');
      }
    } catch (_) {
      // ignore
    }
    try {
      if (askAbortRef.current) askAbortRef.current.abort();
    } catch (_) {
      // ignore
    } finally {
      askAbortRef.current = null;
    }

    // Make all in-flight loops exit (SSE + TTS generator/player).
    runIdRef.current += 1;

    // Stop audio playback / in-flight audio fetch.
    try {
      if (currentAudioRef.current) {
        if (typeof currentAudioRef.current.stop === 'function') {
          currentAudioRef.current.stop();
        } else if (typeof currentAudioRef.current.pause === 'function') {
          currentAudioRef.current.pause();
          currentAudioRef.current.src = '';
        }
      }
    } catch (_) {
      // ignore
    } finally {
      currentAudioRef.current = null;
    }

    ttsTextQueueRef.current = [];
    ttsMetaQueueRef.current = [];
    ttsAudioQueueRef.current = [];
    ragflowDoneRef.current = true;
    receivedSegmentsRef.current = false;
    ttsGeneratorPromiseRef.current = null;
    ttsPlayerPromiseRef.current = null;

    try {
      setQueueStatus('');
      setIsLoading(false);
    } catch (_) {
      // ignore
    }
    try {
      setTourState((prev) => {
        if (!prev || prev.mode === 'idle') return prev;
        return { ...prev, mode: 'interrupted', lastAction: 'interrupt' };
      });
    } catch (_) {
      // ignore
    }
    console.log('[INTERRUPT]', reason || 'manual');
  };

  const runContinuousTour = async ({ startIndex, firstAction, stopsOverride }) => {
    const stops =
      Array.isArray(stopsOverride) && stopsOverride.length ? stopsOverride : Array.isArray(tourStops) ? tourStops : [];
    if (!stops.length) {
      console.warn('[TOUR] continuous: no stops loaded');
      return;
    }

    const token = ++continuousTokenRef.current;
    continuousActiveRef.current = true;
    abortPrefetch('continuous_start');

    const start = Math.max(0, Math.min(Number(startIndex) || 0, stops.length - 1));
    console.log('[TOUR] continuous start', `token=${token}`, `from=${start}`);

    try {
      for (let i = start; i < stops.length; i += 1) {
        if (!continuousActiveRef.current || continuousTokenRef.current !== token) break;
        const action = i === start ? String(firstAction || 'start') : 'next';
        const prompt = buildTourPrompt(action === 'start' ? 'start' : action === 'continue' ? 'continue' : 'next', i);
        beginDebugRun(action === 'start' ? 'guide_start' : action === 'continue' ? 'guide_continue' : 'guide_next');
        const ans = await askQuestion(prompt, { tourAction: action, tourStopIndex: i, continuous: true });

        if (!continuousActiveRef.current || continuousTokenRef.current !== token) break;
        const cur = tourStateRef.current;
        if (cur && cur.mode === 'interrupted') break;

        // Fault tolerance: if the model returned nothing / error, retry once with a shorter, safer prompt.
        const ansText = String(ans || '').trim();
        if (!ansText || ansText.startsWith('错误:') || ansText.includes('RAGFlow') || ansText.includes('不可用')) {
          const durs = tourStopDurationsRef.current || [];
          const tcs = tourStopTargetCharsRef.current || [];
          const dur = Number.isFinite(Number(durs[i])) && Number(durs[i]) > 0 ? Number(durs[i]) : Math.max(15, Number(guideDuration || 60) || 60);
          const tc = Number.isFinite(Number(tcs[i])) && Number(tcs[i]) > 0 ? Number(tcs[i]) : Math.max(30, Math.round(dur * 4.5));
          const dur2 = Math.max(15, Math.round(dur * 0.6));
          const tc2 = Math.max(30, Math.round(tc * 0.6));
          const stopName = getTourStopName(i);
          const retryPrompt =
            `请用更短的版本重新讲解第${i + 1}站「${stopName || stops[i] || ''}」：` +
            `\n- 目标：约${dur2}秒（约${tc2}字）` +
            `\n- 先1句概括主题，再3-5个要点` +
            `\n- 如果知识库没有信息，请明确说“资料不足”，并给出可问现场工作人员的建议。`;
          console.warn('[TOUR] retry stop', i, 'due to empty/error answer');
          beginDebugRun('guide_retry');
          await askQuestion(retryPrompt, {
            tourAction: action,
            tourStopIndex: i,
            continuous: true,
            guideDurationSOverride: dur2,
            guideTargetCharsOverride: tc2,
          });
        }
      }
    } finally {
      if (continuousTokenRef.current === token) {
        continuousActiveRef.current = false;
        abortPrefetch('continuous_end');
        console.log('[TOUR] continuous end', `token=${token}`);
      }
    }
  };

  const askQuestion = async (text, opts) => {
    // Interrupt any previous in-flight /api/ask stream.
    const hasActiveRun =
      !!askAbortRef.current || isLoading || !!ttsGeneratorPromiseRef.current || !!ttsPlayerPromiseRef.current || !!currentAudioRef.current;
    if (hasActiveRun) interruptCurrentRun('new_question');
    try {
      if (askAbortRef.current) askAbortRef.current.abort();
    } catch (_) {
      // ignore
    }

    const options = opts && typeof opts === 'object' ? opts : {};
    const runId = ++runIdRef.current;
    const requestId = `ask_${runId}_${Date.now()}`;
    activeAskRequestIdRef.current = requestId;
    const abortController = new AbortController();
    askAbortRef.current = abortController;
    let segmentIndex = 0;
    segmentSeqRef.current = 0;
    if (!debugRef.current) beginDebugRun('unknown');
    setLastQuestion(text);
    setAnswer('');
    setIsLoading(true);

    // 清空所有队列/状态（用于“打断”或新问题覆盖旧问题）
    ttsTextQueueRef.current = [];
    ttsMetaQueueRef.current = [];
    ttsAudioQueueRef.current = [];
    ragflowDoneRef.current = false;
    receivedSegmentsRef.current = false;
    try {
      seenTtsSegmentsRef.current.clear();
    } catch (_) {
      seenTtsSegmentsRef.current = new Set();
    }
    abortPrefetch('ask_start');

    if (options.tourAction) {
      const action = String(options.tourAction || '').trim();
      const stopIndex = Number.isFinite(options.tourStopIndex) ? options.tourStopIndex : tourStateRef.current.stopIndex;
      const stopName = getTourStopName(stopIndex);
      setTourState((prev) => ({
        ...(prev || {}),
        mode: 'running',
        stopIndex: Number.isFinite(stopIndex) ? stopIndex : (prev && prev.stopIndex) || 0,
        stopName: stopName || (prev && prev.stopName) || '',
        lastAction: action,
      }));
      console.log('[TOUR]', `action=${action}`, `stopIndex=${stopIndex}`, stopName ? `stop=${stopName}` : '');
    } else {
      setTourState((prev) => {
        if (!prev || prev.mode === 'idle') return prev;
        return { ...prev, lastAction: 'user_question' };
      });
    }

    // 启动状态监控
    if (ttsEnabledRef.current) {
      startStatusMonitor(runId);
    } else {
      setQueueStatus('');
    }

    // 停止当前播放的音频
    if (currentAudioRef.current) {
      try {
        if (typeof currentAudioRef.current.stop === 'function') {
          currentAudioRef.current.stop();
        } else if (typeof currentAudioRef.current.pause === 'function') {
          currentAudioRef.current.pause();
          currentAudioRef.current.src = '';
        }
      } catch (_) {
        // ignore
      }
      currentAudioRef.current = null;
    }



    // 终止之前的工作线程
    if (ttsGeneratorPromiseRef.current) {
      ttsGeneratorPromiseRef.current = null;
    }
    if (ttsPlayerPromiseRef.current) {
      ttsPlayerPromiseRef.current = null;
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // TTS音频生成函数
    const generateAudioSegmentUrl = (segmentText) => {
      try {
        const seg = String(segmentText || '').trim();
        if (!seg) return null;
        const url = new URL(USE_SAVED_TTS ? 'http://localhost:8000/api/text_to_speech_saved' : 'http://localhost:8000/api/text_to_speech_stream');
        url.searchParams.set('text', seg);
        url.searchParams.set('request_id', requestId);
        url.searchParams.set('client_id', clientIdRef.current);
        url.searchParams.set('segment_index', String(segmentIndex++));
        return url.toString();
      } catch (err) {
        console.error(`❌ 音频生成失败: "${segmentText}"`, err);
        return null;
      }
    };

    // TTS音频播放函数
    const playAudioUrl = async (audioUrl, segmentText) => {
      if (!audioUrl) return;
      try {
        console.log(`🔊 开始播放: "${segmentText.substring(0, 30)}..."`);
        await new Promise((resolve, reject) => {
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          audio.onended = () => {
            console.log(`✅ 播放完成: "${segmentText.substring(0, 30)}..."`);
            resolve();
          };
          audio.onerror = () => reject(new Error('Audio playback failed'));

          audio.play().catch(reject);
        });
      } catch (err) {
        console.error(`❌ 播放失败: "${segmentText}"`, err);
      } finally {
        if (currentAudioRef.current) {
          currentAudioRef.current = null;
        }
      }
    };

    // TTS音频生成工作线程 - 后台预生成音频
    const startTTSGenerator = () => {
      if (ttsGeneratorPromiseRef.current) return;

      ttsGeneratorPromiseRef.current = (async () => {
        while (runIdRef.current === runId) {
          // 如果音频队列已经有足够的预生成音频，等待
          if (ttsAudioQueueRef.current.length >= MAX_PRE_GENERATE_COUNT) {
            await sleep(50);
            continue;
          }

          // 检查是否有待生成的文本
          const nextSegment = ttsTextQueueRef.current[0]; // 查看但不移除
          if (!nextSegment) {
            if (ragflowDoneRef.current) {
              console.log('🏁 TTS生成器: 所有文本已处理完毕');
              break;
            }
            await sleep(50);
            continue;
          }

          // 移除文本并生成音频
          ttsTextQueueRef.current.shift();
          const nextSeq = ttsMetaQueueRef.current.shift();
          const audioUrl = generateAudioSegmentUrl(nextSegment);

          if (audioUrl) {
            ttsAudioQueueRef.current.push({
              seq: typeof nextSeq === 'number' ? nextSeq : null,
              text: nextSegment,
              url: audioUrl
            });
          }

          // 检查是否应该启动播放器
          if (!ttsPlayerPromiseRef.current && ttsAudioQueueRef.current.length > 0) {
            startTTSPlayer();
          }
        }
      })()
        .catch((err) => {
          console.error('❌ TTS生成线程出错:', err);
        })
        .finally(() => {
          ttsGeneratorPromiseRef.current = null;
        });
    };

    // TTS音频播放工作线程 - 专门负责播放
    const startTTSPlayer = () => {
      if (ttsPlayerPromiseRef.current) return;

      ttsPlayerPromiseRef.current = (async () => {
        while (runIdRef.current === runId) {
          const audioItem = ttsAudioQueueRef.current.shift();
          if (!audioItem) {
            // 检查是否所有工作都已完成
            if (ragflowDoneRef.current && !ttsGeneratorPromiseRef.current) {
              console.log('🏁 TTS播放器: 所有音频播放完毕');
              break;
            }
            await sleep(50);
            continue;
          }

          const segSeq = typeof audioItem.seq === 'number' ? audioItem.seq : null;
          const segDebug =
            debugRef.current && segSeq != null
              ? (debugRef.current.segments || []).find((s) => s.seq === segSeq)
              : null;

          if (debugRef.current) {
            const tReq = nowMs();
            if (!debugRef.current.ttsFirstRequestAt) debugRef.current.ttsFirstRequestAt = tReq;
            if (segDebug && segDebug.ttsRequestAt == null) segDebug.ttsRequestAt = tReq;
            debugRefresh();
          }

          try {
            if (audioItem && audioItem.wavBytes) {
              try {
                await playWavBytesViaDecodeAudioData(audioItem.wavBytes, audioContextRef, currentAudioRef);
              } catch (err) {
                console.warn('[TTS] prefetched playback failed, falling back to stream fetch:', err);
                if (audioItem.url) {
                  await playWavStreamViaWebAudio(
                    audioItem.url,
                    audioContextRef,
                    currentAudioRef,
                    () => playAudioUrl(audioItem.url, audioItem.text),
                    () => {
                      const tFirst = nowMs();
                      debugMark('ttsFirstAudioAt', tFirst);
                      if (segDebug && segDebug.ttsFirstAudioAt == null) {
                        segDebug.ttsFirstAudioAt = tFirst;
                        debugRefresh();
                      }
                    }
                  );
                }
              }
            } else if (USE_SAVED_TTS) {
              try {
                await playWavViaDecodeAudioData(audioItem.url, audioContextRef, currentAudioRef);
              } catch (err) {
                console.warn('[TTS] saved playback failed, fallback to <audio>:', err);
                await playAudioUrl(audioItem.url, audioItem.text);
              }
            } else {
              await playWavStreamViaWebAudio(
                audioItem.url,
                audioContextRef,
                currentAudioRef,
                () => playAudioUrl(audioItem.url, audioItem.text),
                () => {
                  const tFirst = nowMs();
                  debugMark('ttsFirstAudioAt', tFirst);
                  if (segDebug && segDebug.ttsFirstAudioAt == null) {
                    segDebug.ttsFirstAudioAt = tFirst;
                    debugRefresh();
                  }
                }
              );
            }
          } finally {
            // Prevent stale "playing" state from leaking into next segments / next tour stop.
            if (currentAudioRef.current) currentAudioRef.current = null;
          }

          if (segDebug && segDebug.ttsDoneAt == null) {
            segDebug.ttsDoneAt = nowMs();
            debugRefresh();
          }
        }
      })()
        .catch((err) => {
          console.error('❌ TTS播放线程出错:', err);
        })
        .finally(() => {
          if (runIdRef.current === runId) {
            setIsLoading(false);
            debugMark('ttsAllDoneAt');
          }
          ttsPlayerPromiseRef.current = null;
        });
    };

    // If we already prefetched the next stop (RAG+TTS), inject the first audio chunk to reduce the gap.
    if (options.tourAction && ttsEnabledRef.current) {
      const stopIndex = Number.isFinite(options.tourStopIndex) ? options.tourStopIndex : tourStateRef.current.stopIndex;
      const cached = prefetchStoreRef.current.get(stopIndex);
      if (cached && cached.segments && cached.segments.length) {
        try {
          prefetchStoreRef.current.delete(stopIndex);
        } catch (_) {
          // ignore
        }
        for (const seg0 of cached.segments) {
          const segText = String(seg0 && seg0.text ? seg0.text : '').trim();
          const wavBytes = seg0 && seg0.wavBytes ? seg0.wavBytes : null;
          if (!segText || !wavBytes) continue;
          if (seenTtsSegmentsRef.current.has(segText)) continue;
          seenTtsSegmentsRef.current.add(segText);
          const seq = segmentSeqRef.current++;
          ttsAudioQueueRef.current.push({ seq, text: segText, wavBytes, url: null });
          if (debugRef.current) {
            debugRef.current.segments.push({
              seq,
              chars: segText.length,
              ttsRequestAt: nowMs(),
              ttsFirstAudioAt: nowMs(),
              ttsDoneAt: null,
            });
            debugRefresh();
          }
        }
        if (!ttsPlayerPromiseRef.current && ttsAudioQueueRef.current.length > 0) startTTSPlayer();
      }
    }

    let fullAnswer = '';
    try {
      let guideDurationS = Math.max(15, Number(guideDuration || 60) || 60);
      let guideTargetChars = Math.max(30, Math.round(guideDurationS * 4.5));
      let guideStopName = null;
      if (options.tourAction) {
        const idx = Number.isFinite(options.tourStopIndex) ? options.tourStopIndex : tourStateRef.current.stopIndex;
        guideStopName = getTourStopName(idx) || null;
        const durs = tourStopDurationsRef.current || [];
        const tcs = tourStopTargetCharsRef.current || [];
        const d = Number.isFinite(Number(durs[idx])) ? Number(durs[idx]) : 0;
        const tc = Number.isFinite(Number(tcs[idx])) ? Number(tcs[idx]) : 0;
        if (d > 0) guideDurationS = Math.max(15, Math.min(600, d));
        if (tc > 0) guideTargetChars = Math.max(30, tc);
        if (tc <= 0 && d > 0) guideTargetChars = Math.max(30, Math.round(guideDurationS * 4.5));
      }
      if (Number.isFinite(Number(options.guideDurationSOverride)) && Number(options.guideDurationSOverride) > 0) {
        guideDurationS = Math.max(15, Math.min(600, Number(options.guideDurationSOverride)));
      }
      if (Number.isFinite(Number(options.guideTargetCharsOverride)) && Number(options.guideTargetCharsOverride) > 0) {
        guideTargetChars = Math.max(30, Number(options.guideTargetCharsOverride));
      }

      const response = await fetch('http://localhost:8000/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': clientIdRef.current,
        },
        body: JSON.stringify({
          question: text,
          request_id: requestId,
          client_id: clientIdRef.current,
          conversation_name: useAgentMode ? null : selectedChat,
          agent_id: useAgentMode ? (selectedAgentId || null) : null,
          guide: {
            enabled: !!guideEnabled,
            duration_s: guideDurationS,
            target_chars: guideTargetChars,
            stop_name: guideStopName,
            style: String(guideStyle || 'friendly'),
          },
        }),
        signal: abortController.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`RAGFlow HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        if (runIdRef.current !== runId) {
          try {
            abortController.abort();
          } catch (_) {
            // ignore
          }
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data && data.meta && typeof data.meta === 'object') {
                  const intent = data.meta.intent ? String(data.meta.intent) : '';
                  const conf = data.meta.intent_confidence != null ? Number(data.meta.intent_confidence) : null;
                  if (intent) setCurrentIntent({ intent, confidence: conf });
                }
                if (data.chunk && !data.done) {
                  if (!debugRef.current) beginDebugRun('unknown');
                  debugMark('ragflowFirstChunkAt');
                  fullAnswer += data.chunk;
                  setAnswer(fullAnswer);
                }

                if (data.segment && !data.done) {
                  const seg = String(data.segment).trim();
                  if (seg && ttsEnabledRef.current) {
                    if (seenTtsSegmentsRef.current.has(seg)) continue;
                    seenTtsSegmentsRef.current.add(seg);
                    debugMark('ragflowFirstSegmentAt');
                    receivedSegmentsRef.current = true;
                    const seq = segmentSeqRef.current++;
                    ttsTextQueueRef.current.push(seg);
                    ttsMetaQueueRef.current.push(seq);
                  if (debugRef.current) {
                    debugRef.current.segments.push({
                      seq,
                      chars: seg.length,
                      ttsRequestAt: null,
                      ttsFirstAudioAt: null,
                      ttsDoneAt: null,
                    });
                    debugRefresh();
                  }
                  console.log(`📝 收到文本段落: "${seg.substring(0, 30)}..."`);
                  startTTSGenerator();
                }
              }

              if (data.done) {
                debugMark('ragflowDoneAt');
                if (ttsEnabledRef.current && !receivedSegmentsRef.current && seenTtsSegmentsRef.current.size === 0 && fullAnswer.trim()) {
                  const seq = segmentSeqRef.current++;
                  ttsTextQueueRef.current.push(fullAnswer.trim());
                  ttsMetaQueueRef.current.push(seq);
                  if (debugRef.current) {
                    debugRef.current.segments.push({
                      seq,
                      chars: fullAnswer.trim().length,
                      ttsRequestAt: null,
                      ttsFirstAudioAt: null,
                      ttsDoneAt: null,
                    });
                    debugRefresh();
                  }
                  console.log(`📝 收到完整文本: "${fullAnswer.substring(0, 30)}..."`);
                }
                ragflowDoneRef.current = true;

                // Prefetch next stop while current TTS is still playing (continuous tour mode).
                if (options.tourAction && continuousTourRef.current && continuousActiveRef.current) {
                  const curStopIndex = Number.isFinite(options.tourStopIndex) ? options.tourStopIndex : tourStateRef.current.stopIndex;
                  const n = Array.isArray(tourStops) ? tourStops.length : 0;
                  const nextIndex = Number.isFinite(curStopIndex) ? curStopIndex + 1 : -1;
                  if (n && nextIndex >= 0 && nextIndex < n) {
                    const tail = String(fullAnswer || '').trim().slice(-80);
                    const token = continuousTokenRef.current;
                    setTimeout(() => {
                      prefetchTourStopFirstSegment({ stopIndex: nextIndex, tail, token });
                    }, 0);
                  }
                }

                if (!ttsEnabledRef.current) {
                  if (runIdRef.current === runId) setIsLoading(false);
                  return fullAnswer;
                }
                console.log('📚 RAGFlow响应完成，等待TTS处理完毕');
                startTTSGenerator();

                // 等待TTS生成器完成
                if (ttsGeneratorPromiseRef.current) {
                  await ttsGeneratorPromiseRef.current;
                }

                // 等待TTS播放器完成
                if (ttsPlayerPromiseRef.current) {
                  await ttsPlayerPromiseRef.current;
                }
                return fullAnswer;
              }
            } catch (err) {
              console.error('Error parsing chunk:', err);
            }
          }
        }
      }
      return fullAnswer;
    } catch (err) {
      if (abortController.signal.aborted || String(err && err.name) === 'AbortError') {
        return '';
      }
      console.error('Error asking question:', err);
      if (runIdRef.current === runId) setIsLoading(false);
    } finally {
      if (askAbortRef.current === abortController) {
        askAbortRef.current = null;
      }
      if (activeAskRequestIdRef.current === requestId) {
        activeAskRequestIdRef.current = null;
      }
      try {
        if (runIdRef.current === runId) {
          setTourState((prev) => {
            if (!prev || prev.mode === 'idle') return prev;
            if (prev.mode === 'running') {
              const tail = String(fullAnswer || '')
                .trim()
                .slice(-80);
              return { ...prev, mode: 'ready', lastAnswerTail: tail || prev.lastAnswerTail };
            }
            return prev;
          });
        }
      } catch (_) {
        // ignore
      }
      // refresh history list after a run finishes (best-effort)
      try {
        if (runIdRef.current === runId) {
          fetchHistory(historySort);
        }
      } catch (_) {
        // ignore
      }
      try {
        if (runIdRef.current === runId) {
          setTimeout(() => {
            maybeStartNextQueuedQuestion();
          }, 0);
        }
      } catch (_) {
        // ignore
      }
    }
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (ttsEnabledRef.current) {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
      unlockAudio();
    }
    const text = String(inputText || '').trim();
    if (text && (!useAgentMode || !!selectedAgentId)) {
      beginDebugRun('text');
      setInputText('');
      const active =
        !!askAbortRef.current || isLoading || !!ttsGeneratorPromiseRef.current || !!ttsPlayerPromiseRef.current || !!currentAudioRef.current;
      if (groupMode) {
        const item = enqueueQuestion({ speaker: speakerName, text, priority: questionPriority });
        if (item && item.priority === 'high' && active) {
          try {
            interruptCurrentRun('high_priority');
          } catch (_) {
            // ignore
          }
          removeQueuedQuestion(item.id);
          lastSpeakerRef.current = String(item.speaker || '');
          await askQuestion(`【提问人：${item.speaker}】${item.text}`, { fromQueue: true });
          return;
        }
        if (!active) {
          await maybeStartNextQueuedQuestion();
        }
        return;
      }
      await askQuestion(text);
    } else if (text && useAgentMode && !selectedAgentId) {
      alert('请选择智能体后再提问');
    }
  };

  const submitTextAuto = async (text, trigger) => {
    const q = String(text || '').trim();
    if (!q) return;
    if (useAgentMode && !selectedAgentId) {
      alert('请选择智能体后再提问');
      return;
    }
    if (ttsEnabledRef.current) {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
      unlockAudio();
    }
    beginDebugRun(trigger || 'quick');
    setInputText('');
    await askQuestion(q);
  };

  const startTour = async () => {
    if (ttsEnabledRef.current) {
      try {
        // Ensure we create AudioContext at preferred sampleRate before the first (prefetched) segment,
        // otherwise subsequent streaming segments may resample and cause artifacts/white-noise.
        if (audioContextRef.current && audioContextRef.current.sampleRate !== PREFERRED_TTS_SAMPLE_RATE) {
          try {
            audioContextRef.current.close().catch(() => {});
          } catch (_) {
            // ignore
          }
          audioContextRef.current = null;
        }
      } catch (_) {
        audioContextRef.current = null;
      }
      unlockAudio();
    }
    let plannedStops = null;
    try {
      const zone = String(tourZone || (tourMeta && tourMeta.default_zone) || '默认路线');
      const profile = String(audienceProfile || (tourMeta && tourMeta.default_profile) || '大众');
      const duration = Number(guideDuration || 60);
      const resp = await fetch('http://localhost:8000/api/tour/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone, profile, duration_s: duration }),
      });
      const data = await resp.json();
      const stops = Array.isArray(data && data.stops) ? data.stops.map((s) => String(s || '').trim()).filter(Boolean) : [];
      if (stops.length) setTourStops(stops);
      if (stops.length) plannedStops = stops;

      const durs = Array.isArray(data && data.stop_durations_s) ? data.stop_durations_s.map((x) => Number(x) || 0) : [];
      const tcs = Array.isArray(data && data.stop_target_chars) ? data.stop_target_chars.map((x) => Number(x) || 0) : [];
      if (stops.length && durs.length === stops.length) {
        setTourStopDurations(durs);
        tourStopDurationsRef.current = durs;
      } else {
        setTourStopDurations([]);
        tourStopDurationsRef.current = [];
      }
      if (stops.length && tcs.length === stops.length) {
        setTourStopTargetChars(tcs);
        tourStopTargetCharsRef.current = tcs;
      } else {
        setTourStopTargetChars([]);
        tourStopTargetCharsRef.current = [];
      }
    } catch (_) {
      // ignore
    }
    const stopIndex = 0;
    if (continuousTourRef.current) {
      await runContinuousTour({ startIndex: stopIndex, firstAction: 'start', stopsOverride: plannedStops });
      return;
    }
    const prompt = buildTourPrompt('start', stopIndex);
    beginDebugRun('guide_start');
    await askQuestion(prompt, { tourAction: 'start', tourStopIndex: stopIndex });
  };

  const continueTour = async () => {
    if (ttsEnabledRef.current) {
      try {
        if (audioContextRef.current && audioContextRef.current.sampleRate !== PREFERRED_TTS_SAMPLE_RATE) {
          try {
            audioContextRef.current.close().catch(() => {});
          } catch (_) {
            // ignore
          }
          audioContextRef.current = null;
        }
      } catch (_) {
        audioContextRef.current = null;
      }
      unlockAudio();
    }
    const cur = tourStateRef.current;
    const stopIndex = Number.isFinite(cur && cur.stopIndex) && cur.stopIndex >= 0 ? cur.stopIndex : 0;
    if (continuousTourRef.current) {
      await runContinuousTour({ startIndex: stopIndex, firstAction: 'continue' });
      return;
    }
    const prompt = buildTourPrompt('continue', stopIndex);
    beginDebugRun('guide_continue');
    await askQuestion(prompt, { tourAction: 'continue', tourStopIndex: stopIndex });
  };

  const prevTourStop = async () => {
    const cur = tourStateRef.current;
    const stopIndexRaw = Number.isFinite(cur && cur.stopIndex) ? cur.stopIndex - 1 : 0;
    const stopIndex = Math.max(0, stopIndexRaw);
    const prompt = buildTourPrompt('next', stopIndex);
    beginDebugRun('guide_prev');
    await askQuestion(prompt, { tourAction: 'next', tourStopIndex: stopIndex });
  };

  const nextTourStop = async () => {
    const cur = tourStateRef.current;
    const n = Array.isArray(tourStops) ? tourStops.length : 0;
    const nextIndexRaw = Number.isFinite(cur && cur.stopIndex) ? cur.stopIndex + 1 : 0;
    const stopIndex = n ? Math.min(nextIndexRaw, n - 1) : Math.max(0, nextIndexRaw);
    const prompt = buildTourPrompt('next', stopIndex);
    beginDebugRun('guide_next');
    await askQuestion(prompt, { tourAction: 'next', tourStopIndex: stopIndex });
  };

  const jumpTourStop = async (idx) => {
    const n = Array.isArray(tourStops) ? tourStops.length : 0;
    const stopIndex = n ? Math.max(0, Math.min(Number(idx) || 0, n - 1)) : Math.max(0, Number(idx) || 0);
    const prompt = buildTourPrompt('next', stopIndex);
    beginDebugRun('guide_jump');
    await askQuestion(prompt, { tourAction: 'next', tourStopIndex: stopIndex });
  };

  const resetTour = () => {
    interruptCurrentRun('tour_reset');
    setTourState({
      mode: 'idle',
      stopIndex: -1,
      stopName: '',
      lastAnswerTail: '',
      lastAction: null,
    });
  };

  useEffect(() => {
    if (!messagesEndRef.current) return;
    try {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (_) {
      // ignore
    }
  }, [lastQuestion, answer, isLoading, queueStatus]);

  return (
    <div className="app">
      <div className="container">
        <h1>AI语音问答</h1>

        <div className="controls">
          <label className="tts-toggle">
            <input
              type="checkbox"
              checked={useAgentMode}
              onChange={(e) => setUseAgentMode(e.target.checked)}
            />
            <span>使用智能体</span>
          </label>

          {useAgentMode ? (
            <label className="kb-select">
              <span>智能体</span>
              <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)}>
                <option value="">请选择</option>
                {(agentOptions || []).map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="kb-select">
              <span>Chat(会话)</span>
              <select value={selectedChat} onChange={(e) => setSelectedChat(e.target.value)}>
                {(chatOptions && chatOptions.length ? chatOptions : [selectedChat]).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="tts-toggle">
            <input
              type="checkbox"
              checked={guideEnabled}
              onChange={(e) => setGuideEnabled(e.target.checked)}
            />
            <span>展厅讲解</span>
          </label>

          {guideEnabled ? (
            <label className="kb-select">
              <span>时长</span>
              <select value={guideDuration} onChange={(e) => setGuideDuration(e.target.value)}>
                <option value="30">30秒</option>
                <option value="60">1分钟</option>
                <option value="180">3分钟</option>
              </select>
            </label>
          ) : null}

          {guideEnabled ? (
            <label className="kb-select">
              <span>风格</span>
              <select value={guideStyle} onChange={(e) => setGuideStyle(e.target.value)}>
                <option value="friendly">通俗</option>
                <option value="pro">专业</option>
              </select>
            </label>
          ) : null}

          {guideEnabled ? (
            <label className="kb-select">
              <span>展区</span>
              <select value={tourZone} onChange={(e) => setTourZone(e.target.value)}>
                {(tourMeta && Array.isArray(tourMeta.zones) ? tourMeta.zones : ['默认路线']).map((z) => (
                  <option key={String(z)} value={String(z)}>
                    {String(z)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {guideEnabled ? (
            <label className="kb-select">
              <span>人群</span>
              <select value={audienceProfile} onChange={(e) => setAudienceProfile(e.target.value)}>
                {(tourMeta && Array.isArray(tourMeta.profiles) ? tourMeta.profiles : ['大众', '儿童', '专业']).map((p) => (
                  <option key={String(p)} value={String(p)}>
                    {String(p)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="tts-toggle" title="多人围观：轮询提问 + 优先级">
            <input type="checkbox" checked={groupMode} onChange={(e) => setGroupMode(e.target.checked)} />
            <span>多人围观</span>
          </label>

          <label className="tts-toggle">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
            />
            <span>语音播报</span>
          </label>

          {guideEnabled ? (
            <label className="tts-toggle" title="无人打断时自动从第1站讲到最后，并预取下一站减少停顿">
              <input type="checkbox" checked={continuousTour} onChange={(e) => setContinuousTour(e.target.checked)} />
              <span>连续讲解</span>
            </label>
          ) : null}

          <div className="tour-status" title="讲解状态机：打断/继续/下一站">
            <span className="tour-status-k">讲解</span>
            <span className="tour-status-v">
              {tourState.mode === 'idle'
                ? '未开始'
                : `${tourState.mode === 'running' ? '进行中' : tourState.mode === 'interrupted' ? '已打断' : '就绪'}${
                    tourState.stopIndex >= 0 ? ` · 第${tourState.stopIndex + 1}站` : ''
                  }${tourState.stopName ? ` · ${tourState.stopName}` : ''}`}
              {currentIntent && currentIntent.intent ? ` · 意图:${currentIntent.intent}` : ''}
            </span>
          </div>

          {guideEnabled ? (
            <div className="tour-controls">
              <select value={String(tourSelectedStopIndex)} onChange={(e) => setTourSelectedStopIndex(Number(e.target.value) || 0)}>
                {(tourStops && tourStops.length ? tourStops : ['第1站']).map((s, i) => (
                  <option key={`${i}_${s}`} value={String(i)}>
                    {`第${i + 1}站 ${String(s || '').trim()}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="tour-jump-btn"
                onClick={async () => {
                  try {
                    await jumpTourStop(tourSelectedStopIndex);
                  } catch (e) {
                    console.error('[TOUR] jump failed', e);
                  }
                }}
              >
                跳转
              </button>
              <button type="button" className="tour-reset-btn" onClick={resetTour} title="清空讲解状态">
                重置
              </button>
            </div>
          ) : null}
        </div>

        <div className="input-section">
          <div className="voice-input">
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onPointerDown={onRecordPointerDown}
              onPointerUp={onRecordPointerUp}
              onPointerCancel={onRecordPointerCancel}
              onPointerLeave={onRecordPointerCancel}
              onClick={() => {
                // Fallback only when PointerEvent is not supported (avoid double start/stop from click after pointerup).
                if (POINTER_SUPPORTED) return;
                if (isRecording) stopRecording();
                else startRecording();
              }}
              disabled={false}
              aria-label={isRecording ? '录音中（松开结束）' : '按住说话'}
              title={isRecording ? '录音中（松开结束）' : '按住说话'}
            >
              {isRecording ? '●' : '🎙'}
            </button>
          </div>

          <form className="text-input" onSubmit={handleTextSubmit}>
            {groupMode ? (
              <input
                type="text"
                className="speaker-tag"
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="提问人"
                title="多人围观模式：当前提问人"
              />
            ) : null}
            {groupMode ? (
              <select
                className="priority-select"
                value={questionPriority}
                onChange={(e) => setQuestionPriority(e.target.value)}
                title="多人围观模式：问题优先级（高优先会打断当前回答）"
              >
                <option value="normal">普通</option>
                <option value="high">高优先</option>
              </select>
            ) : null}
            <input
              type="text"
              ref={inputElRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="输入问题…"
              disabled={false}
            />
            {groupMode ? <span className="queue-badge" title="围观提问队列">{(questionQueue || []).length}</span> : null}
            <button
              type="button"
              className="stop-btn"
              onClick={() => interruptCurrentRun('user_stop')}
              disabled={!isLoading && !(ttsGeneratorPromiseRef.current || ttsPlayerPromiseRef.current || currentAudioRef.current)}
              title="打断当前回答/播报"
            >
              打断
            </button>
            <button type="submit" disabled={!String(inputText || '').trim() || (useAgentMode && !selectedAgentId)}>
              发送
            </button>
          </form>

          <div className="quick-actions">
            {[
              { label: '开始讲解', action: 'tour_start', auto: true, primary: true },
              { label: '继续讲解', action: 'tour_continue', auto: true, primary: true },
              { label: '下一站', action: 'tour_next', auto: true },
              { label: '上一站', action: 'tour_prev', auto: true },
              { label: '30秒总结', text: '请用30秒总结刚才的讲解' },
              { label: '更通俗', text: '换个更通俗易懂的说法' },
              { label: '更专业', text: '换个更专业的讲法' },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                className={b.primary ? 'quick-btn quick-btn-primary' : 'quick-btn'}
                onClick={async () => {
                  if (b.auto) {
                    try {
                      if (b.action === 'tour_start') await startTour();
                      else if (b.action === 'tour_continue') await continueTour();
                      else if (b.action === 'tour_next') await nextTourStop();
                      else if (b.action === 'tour_prev') await prevTourStop();
                      else await submitTextAuto(b.text, 'quick');
                    } catch (e) {
                      console.error('[Quick] submit failed', e);
                    }
                    return;
                  }
                  setInputText(b.text || '');
                  try {
                    setTimeout(() => {
                      if (inputElRef.current && typeof inputElRef.current.focus === 'function') {
                        inputElRef.current.focus();
                      }
                    }, 0);
                  } catch (_) {
                    // ignore
                  }
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="layout">
          <aside className="history-panel">
            <div className="history-title">
              <span>历史</span>
              <select value={historySort} onChange={(e) => setHistorySort(e.target.value)}>
                <option value="time">按时间</option>
                <option value="count">按次数</option>
              </select>
            </div>
            <div className="history-list">
              {(historyItems || []).slice(0, 200).map((item, idx) => {
                const q = String(item.question || '').trim();
                if (!q) return null;
                const cnt = item.cnt != null ? Number(item.cnt) : null;
                const meta = cnt != null ? `${cnt}次` : '';
                const key = item.id != null ? `id_${item.id}` : `q_${idx}_${q}`;
                return (
                  <button
                    key={key}
                    type="button"
                    className="history-item"
                    onClick={() => {
                      setInputText(q);
                      try {
                        setTimeout(() => {
                          if (inputElRef.current && typeof inputElRef.current.focus === 'function') {
                            inputElRef.current.focus();
                          }
                        }, 0);
                      } catch (_) {
                        // ignore
                      }
                    }}
                    title={q}
                  >
                    <div className="history-row">
                      <div className="history-q">{q}</div>
                      {meta ? <div className="history-count">{meta}</div> : null}
                    </div>
                  </button>
                );
              })}
              {(!historyItems || historyItems.length === 0) ? (
                <div className="history-empty">暂无历史</div>
              ) : null}
            </div>
          </aside>
          <div className="main">
        {lastQuestion && (
          <div className="question-section">
            <h3>问题: {lastQuestion}</h3>
          </div>
        )}

        {answer && (
          <div className="answer-section">
            <h3>回答:</h3>
            <p>{answer}</p>
          </div>
        )}

        {isLoading && (
          <div className="loading">
            处理中...
          </div>
        )}

        {queueStatus && (
          <div className="queue-status">
            <small>{queueStatus}</small>
          </div>
        )}
        <div ref={messagesEndRef} />
          </div>

          <aside className="debug-panel">
            <div className="debug-title">调试面板</div>
            {!debugInfo ? (
              <div className="debug-muted">点击发送后显示耗时</div>
            ) : (
              <>
                <div className="debug-row">
                  <div className="debug-k">触发</div>
                  <div className="debug-v">{debugInfo.trigger}</div>
                </div>
                <div className="debug-row">
                  <div className="debug-k">提交 → 首字</div>
                  <div className="debug-v">
                    {debugInfo.ragflowFirstChunkAt ? `${(debugInfo.ragflowFirstChunkAt - debugInfo.submitAt).toFixed(0)} ms` : '—'}
                  </div>
                </div>
                <div className="debug-row">
                  <div className="debug-k">提交 → 首段</div>
                  <div className="debug-v">
                    {debugInfo.ragflowFirstSegmentAt ? `${(debugInfo.ragflowFirstSegmentAt - debugInfo.submitAt).toFixed(0)} ms` : '—'}
                  </div>
                </div>
                <div className="debug-row">
                  <div className="debug-k">提交 → TTS首包</div>
                  <div className="debug-v">
                    {debugInfo.ttsFirstAudioAt ? `${(debugInfo.ttsFirstAudioAt - debugInfo.submitAt).toFixed(0)} ms` : (ttsEnabled ? '—' : '已关闭')}
                  </div>
                </div>
                <div className="debug-row">
                  <div className="debug-k">提交 → RAG结束</div>
                  <div className="debug-v">
                    {debugInfo.ragflowDoneAt ? `${(debugInfo.ragflowDoneAt - debugInfo.submitAt).toFixed(0)} ms` : '—'}
                  </div>
                </div>
                <div className="debug-row">
                  <div className="debug-k">提交 → TTS结束</div>
                  <div className="debug-v">
                    {debugInfo.ttsAllDoneAt ? `${(debugInfo.ttsAllDoneAt - debugInfo.submitAt).toFixed(0)} ms` : (ttsEnabled ? '—' : '已关闭')}
                  </div>
                </div>

                <div className="debug-subtitle">围观队列</div>
                <div className="debug-list">
                  {!(questionQueue && questionQueue.length) ? (
                    <div className="debug-muted">无排队问题</div>
                  ) : (
                    (questionQueue || []).slice(0, 12).map((q) => (
                      <div key={q.id} className="debug-item">
                        <div className="debug-item-h">
                          <span>{q.speaker || '观众'}</span>
                          <span>{q.priority === 'high' ? '高优先' : '普通'}</span>
                        </div>
                        <div className="debug-item-b">
                          <div className="queue-q">{String(q.text || '').slice(0, 60)}</div>
                          <div className="queue-actions">
                            <button type="button" className="queue-btn" onClick={() => answerQueuedNow(q)}>
                              立即回答
                            </button>
                            <button type="button" className="queue-btn queue-btn-danger" onClick={() => removeQueuedQuestion(q.id)}>
                              移除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="debug-subtitle">分段</div>
                <div className="debug-list">
                  {(debugInfo.segments || []).slice(-12).map((s) => (
                    <div key={s.seq} className="debug-item">
                      <div className="debug-item-h">
                        <span>#{s.seq}</span>
                        <span>{s.chars}字</span>
                      </div>
                      <div className="debug-item-b">
                        <div>请求: {s.ttsRequestAt ? `${(s.ttsRequestAt - debugInfo.submitAt).toFixed(0)}ms` : '—'}</div>
                        <div>首包: {s.ttsFirstAudioAt ? `${(s.ttsFirstAudioAt - debugInfo.submitAt).toFixed(0)}ms` : '—'}</div>
                        <div>结束: {s.ttsDoneAt ? `${(s.ttsDoneAt - debugInfo.submitAt).toFixed(0)}ms` : '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default App;
