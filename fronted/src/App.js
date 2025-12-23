import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import {
  decodeAndConvertToWav16kMono as decodeAndConvertToWav16kMonoExt,
  unlockAudio as unlockAudioExt,
} from './audio/ttsAudio';
import { cancelRequest as cancelBackendRequestExt, fetchJson } from './api/backendClient';
import { RecorderManager } from './managers/RecorderManager';
import { TtsQueueManager } from './managers/TtsQueueManager';
import { TourPipelineManager } from './managers/TourPipelineManager';
import { AskWorkflowManager } from './managers/AskWorkflowManager';
import { HistoryPanel } from './components/HistoryPanel';
import { DebugPanel } from './components/DebugPanel';
import { ControlBar } from './components/ControlBar';
import { Composer } from './components/Composer';
import { ChatPanel } from './components/ChatPanel';

// eslint-disable-next-line no-unused-vars
async function _legacyPlayWavStreamViaWebAudio(url, audioContextRef, currentAudioRef, fallbackPlay, onFirstAudioChunk) {
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
    if (fallbackPlay) return fallbackPlay();
    throw err;
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
  const messagesEndRef = useRef(null);
  const PREFERRED_TTS_SAMPLE_RATE = 16000;
  const ttsEnabledRef = useRef(true);
  const continuousTourRef = useRef(continuousTour);
  const guideEnabledRef = useRef(guideEnabled);
  const tourStopsRef = useRef(tourStops);
  const audienceProfileRef = useRef(audienceProfile);
  const guideDurationRef = useRef(guideDuration);
  const guideStyleRef = useRef(guideStyle);
  const useAgentModeRef = useRef(useAgentMode);
  const selectedChatRef = useRef(selectedChat);
  const selectedAgentIdRef = useRef(selectedAgentId);
  const debugRef = useRef(null);
  const askAbortRef = useRef(null);
  const tourStateRef = useRef(tourState);
  const tourStopDurationsRef = useRef(tourStopDurations);
  const tourStopTargetCharsRef = useRef(tourStopTargetChars);
  const clientIdRef = useRef(clientId);
  const activeAskRequestIdRef = useRef(null);
  const groupModeRef = useRef(groupMode);
  const queueRef = useRef([]);
  const lastSpeakerRef = useRef('');

  const ttsManagerRef = useRef(null);
  const tourPipelineRef = useRef(null);

  const runIdRef = useRef(0);
  const currentAudioRef = useRef(null);
  const receivedSegmentsRef = useRef(false);
  const audioContextRef = useRef(null);
  const USE_SAVED_TTS = false;
  const recordPointerIdRef = useRef(null);
  const recordCanceledRef = useRef(false);
  const inputElRef = useRef(null);
  const recorderManagerRef = useRef(null);
  const askWorkflowRef = useRef(null);

  const POINTER_SUPPORTED = typeof window !== 'undefined' && 'PointerEvent' in window;
  const MIN_RECORD_MS = 900;

  const getTourPipeline = () => {
    if (tourPipelineRef.current) return tourPipelineRef.current;

    tourPipelineRef.current = new TourPipelineManager({
      baseUrl: 'http://localhost:8000',
      getClientId: () => clientIdRef.current,
      getStops: () => tourStopsRef.current || [],
      getLastAnswerTail: () => String((tourStateRef.current && tourStateRef.current.lastAnswerTail) || ''),
      getAudienceProfile: () => String(audienceProfileRef.current || ''),
      getGuideDuration: () => Number(guideDurationRef.current || 60),
      getGuideStyle: () => String(guideStyleRef.current || 'friendly'),
      getGuideEnabled: () => !!guideEnabledRef.current,
      getPerStopDurations: () => tourStopDurationsRef.current || [],
      getPerStopTargetChars: () => tourStopTargetCharsRef.current || [],
      isContinuousTourEnabled: () => !!continuousTourRef.current,
      getConversationConfig: () => ({
        useAgentMode: !!useAgentModeRef.current,
        selectedChat: useAgentModeRef.current ? null : selectedChatRef.current,
        selectedAgentId: useAgentModeRef.current ? selectedAgentIdRef.current : null,
      }),
      onLog: (...args) => console.log(...args),
      onWarn: (...args) => console.warn(...args),
    });

    return tourPipelineRef.current;
  };

  const abortPrefetch = (reason) => {
    if (!tourPipelineRef.current) return;
    tourPipelineRef.current.abortPrefetch(reason);
  };

  const getTtsManager = () => {
    if (ttsManagerRef.current) return ttsManagerRef.current;

    ttsManagerRef.current = new TtsQueueManager({
      audioContextRef,
      currentAudioRef,
      getRunId: () => runIdRef.current,
      getClientId: () => clientIdRef.current,
      nowMs,
      baseUrl: 'http://localhost:8000',
      useSavedTts: USE_SAVED_TTS,
      maxPreGenerateCount: MAX_PRE_GENERATE_COUNT,
      onStopIndexChange: (nextStopIndex) => {
        if (!guideEnabledRef.current) return;
        const curStopIndex = Number.isFinite(tourStateRef.current && tourStateRef.current.stopIndex)
          ? Number(tourStateRef.current.stopIndex)
          : -1;
        if (Number(nextStopIndex) === curStopIndex) return;
        const stopName = getTourStopName(Number(nextStopIndex));
        setTourState((prev) => ({
          ...(prev || {}),
          mode: 'running',
          stopIndex: Number(nextStopIndex),
          stopName: stopName || (prev && prev.stopName) || '',
          lastAction: 'next',
        }));
        const cached = tourPipelineRef.current ? tourPipelineRef.current.getPrefetch(Number(nextStopIndex)) : null;
        if (cached && cached.answerText) {
          setAnswer(String(cached.answerText || ''));
        }
      },
      onDebug: (evt) => {
        if (!evt || !debugRef.current) return;
        const cur = debugRef.current;
        const seq = typeof evt.seq === 'number' ? evt.seq : null;

        if (evt.type === 'enqueue') {
          cur.segments.push({
            seq,
            chars: Number(evt.chars) || 0,
            ttsRequestAt: null,
            ttsFirstAudioAt: null,
            ttsDoneAt: null,
          });
          debugRefresh();
          return;
        }

        if (evt.type === 'tts_request') {
          if (!cur.ttsFirstRequestAt) cur.ttsFirstRequestAt = evt.t || nowMs();
          if (seq != null) {
            const segDebug = (cur.segments || []).find((s) => s.seq === seq);
            if (segDebug && segDebug.ttsRequestAt == null) segDebug.ttsRequestAt = evt.t || nowMs();
          }
          debugRefresh();
          return;
        }

        if (evt.type === 'tts_first_audio') {
          debugMark('ttsFirstAudioAt', evt.t || nowMs());
          if (seq != null) {
            const segDebug = (cur.segments || []).find((s) => s.seq === seq);
            if (segDebug && segDebug.ttsFirstAudioAt == null) segDebug.ttsFirstAudioAt = evt.t || nowMs();
          }
          debugRefresh();
          return;
        }

        if (evt.type === 'tts_done') {
          if (seq != null) {
            const segDebug = (cur.segments || []).find((s) => s.seq === seq);
            if (segDebug && segDebug.ttsDoneAt == null) segDebug.ttsDoneAt = evt.t || nowMs();
          }
          debugRefresh();
        }
      },
      onLog: (...args) => console.log(...args),
      onWarn: (...args) => console.warn(...args),
      onError: (...args) => console.error(...args),
    });

    return ttsManagerRef.current;
  };

  const cancelBackendRequest = (requestId, reason) => {
    cancelBackendRequestExt({ requestId, clientId: clientIdRef.current, reason });
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e || e.key !== 'Escape') return;
      const hasActiveRun =
        !!askAbortRef.current ||
        isLoading ||
        (ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) ||
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

  const decodeAndConvertToWav16kMono = async (blob) => {
    return decodeAndConvertToWav16kMonoExt(blob);
  };

  const unlockAudio = () => {
    unlockAudioExt(audioContextRef, PREFERRED_TTS_SAMPLE_RATE);
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

      if (ttsManagerRef.current) {
        ttsManagerRef.current.stop('tts_disabled');
      }
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
    guideEnabledRef.current = !!guideEnabled;
  }, [guideEnabled]);

  useEffect(() => {
    tourStateRef.current = tourState;
  }, [tourState]);

  useEffect(() => {
    tourStopsRef.current = Array.isArray(tourStops) ? tourStops : [];
  }, [tourStops]);

  useEffect(() => {
    tourStopDurationsRef.current = Array.isArray(tourStopDurations) ? tourStopDurations : [];
  }, [tourStopDurations]);

  useEffect(() => {
    tourStopTargetCharsRef.current = Array.isArray(tourStopTargetChars) ? tourStopTargetChars : [];
  }, [tourStopTargetChars]);

  useEffect(() => {
    audienceProfileRef.current = String(audienceProfile || '').trim();
  }, [audienceProfile]);

  useEffect(() => {
    guideDurationRef.current = guideDuration;
    guideStyleRef.current = guideStyle;
  }, [guideDuration, guideStyle]);

  useEffect(() => {
    useAgentModeRef.current = !!useAgentMode;
  }, [useAgentMode]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId]);

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
        const meta = await fetchJson('/api/tour/meta');
        if (cancelled) return;
        if (meta && typeof meta === 'object') {
          setTourMeta(meta);
          const zones = Array.isArray(meta.zones) ? meta.zones : [];
          const profiles = Array.isArray(meta.profiles) ? meta.profiles : [];
          setTourZone((prev) => (prev ? prev : String(meta.default_zone || zones[0] || '默认路线')));
          setAudienceProfile((prev) => (prev ? prev : String(meta.default_profile || profiles[0] || '大众')));
        }

        const data = await fetchJson('/api/tour/stops');
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
    return getTourPipeline().buildTourPrompt(action, stopIndex, tailOverride);
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
    if (tourPipelineRef.current && tourPipelineRef.current.isActive()) return;
    const ttsBusy = ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false;
    if (isLoading || askAbortRef.current || ttsBusy) return;
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
        !!askAbortRef.current ||
        isLoading ||
        !!currentAudioRef.current ||
        (ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false);
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
        const data = await fetchJson('/api/ragflow/chats');
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
        const data = await fetchJson('/api/ragflow/agents');
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
    const mgr = ttsManagerRef.current;
    const stats = mgr ? mgr.getStats() : { textCount: 0, audioCount: 0, generatorRunning: false, playerRunning: false };
    const textCount = stats.textCount || 0;
    const audioCount = stats.audioCount || 0;
    const generatorRunning = !!stats.generatorRunning;
    const playerRunning = !!stats.playerRunning;

    setQueueStatus(
      `📝待生成: ${textCount} | 🔊预生成: ${audioCount} | ` +
      `${generatorRunning ? '🎵生成中' : '⏸️生成空闲'} | ` +
      `${playerRunning ? '🔊播放中' : '⏸️播放空闲'}`
    );
  };

  // 启动队列状态监控
  const startStatusMonitor = (runId) => {
    const interval = setInterval(() => {
      const busy = ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false;
      if (runIdRef.current === runId && (isLoading || busy)) {
        updateQueueStatus();
      } else {
        setQueueStatus('');
        clearInterval(interval);
      }
    }, 200); // 每200ms更新一次状态
  };

  const startRecording = async () => {
    if (!recorderManagerRef.current) {
      recorderManagerRef.current = new RecorderManager({
        minRecordMs: MIN_RECORD_MS,
        onStateChange: (v) => setIsRecording(!!v),
        onBlob: async (blob, meta) => {
          await processAudio(blob, meta);
        },
        onLog: (...args) => console.log(...args),
      });
    }
    unlockAudio();
    await recorderManagerRef.current.start();
  };

  const stopRecording = () => {
    if (!recorderManagerRef.current) return;
    // Keep the "unlock" behavior from the original implementation.
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
    recorderManagerRef.current.stop();
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

  const getAskWorkflow = () => {
    if (!askWorkflowRef.current) {
      askWorkflowRef.current = new AskWorkflowManager({
        baseUrl: 'http://localhost:8000',
        getIsLoading: () => isLoading,
        runIdRef,
        askAbortRef,
        activeAskRequestIdRef,
        cancelBackendRequest,
        clientIdRef,
        debugRef,
        beginDebugRun,
        debugMark,
        setLastQuestion,
        setAnswer,
        setIsLoading,
        setQueueStatus,
        setTourState,
        setCurrentIntent,
        receivedSegmentsRef,
        ttsEnabledRef,
        ttsManagerRef,
        getTtsManager,
        abortPrefetch,
        tourPipelineRef,
        getTourPipeline,
        tourStateRef,
        getTourStopName,
        startStatusMonitor,
        guideEnabledRef,
        guideDurationRef,
        guideStyleRef,
        useAgentModeRef,
        selectedChatRef,
        selectedAgentIdRef,
        tourStopDurationsRef,
        tourStopTargetCharsRef,
        currentAudioRef,
        getHistorySort: () => historySort,
        fetchHistory,
        maybeStartNextQueuedQuestion,
      });
    } else {
      askWorkflowRef.current.setDeps({
        getIsLoading: () => isLoading,
        getHistorySort: () => historySort,
      });
    }
    return askWorkflowRef.current;
  };

  const interruptCurrentRun = (reason) => {
    getAskWorkflow().interrupt(reason);
  };

  const runContinuousTour = async ({ startIndex, firstAction, stopsOverride }) => {
    const stops =
      Array.isArray(stopsOverride) && stopsOverride.length ? stopsOverride : Array.isArray(tourStops) ? tourStops : [];
    if (!stops.length) {
      console.warn('[TOUR] continuous: no stops loaded');
      return;
    }
    const action = String(firstAction || 'start');
    beginDebugRun(action === 'continue' ? 'guide_continue' : 'guide_start');
    await getTourPipeline().startContinuousTour({ startIndex, firstAction: action, askQuestion, stopsOverride: stops });
  };

  const askQuestion = async (text, opts) => {
    try {
      const wf = getAskWorkflow();
      if (wf && typeof wf.ask === 'function') return wf.ask(text, opts);
    } catch (_) {}
    // Interrupt any previous in-flight /api/ask stream.
    const hasActiveRun =
      !!askAbortRef.current ||
      isLoading ||
      !!currentAudioRef.current ||
      (ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false);
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
    if (!debugRef.current) beginDebugRun('unknown');
    setLastQuestion(text);
    setAnswer('');
    setIsLoading(true);

    // 清空所有队列/状态（用于“打断”或新问题覆盖旧问题）
    receivedSegmentsRef.current = false;
    const ttsMgr = getTtsManager();
    ttsMgr.resetForRun({ requestId });
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
            continuous: !!options.continuous,
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
                    ttsMgr.enqueueText(seg, { stopIndex: options.tourAction ? options.tourStopIndex : null, source: 'ask' });
                    debugMark('ragflowFirstSegmentAt');
                    receivedSegmentsRef.current = true;
                    console.log(`📝 收到文本段落: "${seg.substring(0, 30)}..."`);
                    ttsMgr.ensureRunning();
                  }
                }

              if (data.done) {
                debugMark('ragflowDoneAt');
                if (ttsEnabledRef.current && !receivedSegmentsRef.current && !ttsMgr.hasAnySegment() && fullAnswer.trim()) {
                  ttsMgr.enqueueText(fullAnswer.trim(), { stopIndex: options.tourAction ? options.tourStopIndex : null, source: 'ask_done' });
                  console.log(`📝 收到完整文本: "${fullAnswer.substring(0, 30)}..."`);
                }
                ttsMgr.markRagDone();

                // Prefetch next stop text (continuous tour pipeline) without waiting for current TTS.
                if (options.tourAction && options.continuousRoot) {
                  try {
                    const curStopIndex = Number.isFinite(options.tourStopIndex) ? options.tourStopIndex : tourStateRef.current.stopIndex;
                    const tail = String(fullAnswer || '').trim().slice(-80);
                    getTourPipeline().maybePrefetchNextStop({
                      currentStopIndex: curStopIndex,
                      tail,
                      enqueueSegment: (seg, meta) => ttsMgr.enqueueText(seg, meta),
                      ensureTtsRunning: () => {
                        if (ttsEnabledRef.current) ttsMgr.ensureRunning();
                      },
                    });
                  } catch (_) {
                    // ignore
                  }
                }

                if (!ttsEnabledRef.current) {
                  if (runIdRef.current === runId) setIsLoading(false);
                  return fullAnswer;
                }
                console.log('📚 RAGFlow响应完成，等待TTS处理完毕');
                ttsMgr.ensureRunning();
                await ttsMgr.waitForIdle();
                if (runIdRef.current === runId) {
                  setIsLoading(false);
                  debugMark('ttsAllDoneAt');
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
        !!askAbortRef.current ||
        isLoading ||
        !!currentAudioRef.current ||
        (ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false);
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
      const data = await fetchJson('/api/tour/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone, profile, duration_s: duration }),
      });
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

        <ControlBar
          useAgentMode={useAgentMode}
          onChangeUseAgentMode={setUseAgentMode}
          agentOptions={agentOptions}
          selectedAgentId={selectedAgentId}
          onChangeSelectedAgentId={setSelectedAgentId}
          chatOptions={chatOptions}
          selectedChat={selectedChat}
          onChangeSelectedChat={setSelectedChat}
          guideEnabled={guideEnabled}
          onChangeGuideEnabled={setGuideEnabled}
          guideDuration={guideDuration}
          onChangeGuideDuration={setGuideDuration}
          guideStyle={guideStyle}
          onChangeGuideStyle={setGuideStyle}
          tourMeta={tourMeta}
          tourZone={tourZone}
          onChangeTourZone={setTourZone}
          audienceProfile={audienceProfile}
          onChangeAudienceProfile={setAudienceProfile}
          groupMode={groupMode}
          onChangeGroupMode={setGroupMode}
          ttsEnabled={ttsEnabled}
          onChangeTtsEnabled={setTtsEnabled}
          continuousTour={continuousTour}
          onChangeContinuousTour={setContinuousTour}
          tourState={tourState}
          currentIntent={currentIntent}
          tourStops={tourStops}
          tourSelectedStopIndex={tourSelectedStopIndex}
          onChangeTourSelectedStopIndex={setTourSelectedStopIndex}
          onJump={async () => {
            try {
              await jumpTourStop(tourSelectedStopIndex);
            } catch (e) {
              console.error('[TOUR] jump failed', e);
            }
          }}
          onReset={resetTour}
        />

        <Composer
          isRecording={isRecording}
          pointerSupported={POINTER_SUPPORTED}
          onRecordPointerDown={onRecordPointerDown}
          onRecordPointerUp={onRecordPointerUp}
          onRecordPointerCancel={onRecordPointerCancel}
          onRecordClickFallback={() => {
            if (POINTER_SUPPORTED) return;
            if (isRecording) stopRecording();
            else startRecording();
          }}
          groupMode={groupMode}
          speakerName={speakerName}
          onChangeSpeakerName={setSpeakerName}
          questionPriority={questionPriority}
          onChangeQuestionPriority={setQuestionPriority}
          inputText={inputText}
          onChangeInputText={setInputText}
          inputElRef={inputElRef}
          questionQueueLength={(questionQueue || []).length}
          onInterrupt={() => interruptCurrentRun('user_stop')}
          interruptDisabled={
            !isLoading && !((ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) || currentAudioRef.current)
          }
          useAgentMode={useAgentMode}
          selectedAgentId={selectedAgentId}
          onSubmit={handleTextSubmit}
          onStartTour={startTour}
          onContinueTour={continueTour}
          onNextTourStop={nextTourStop}
          onPrevTourStop={prevTourStop}
          onSubmitTextAuto={submitTextAuto}
          focusInput={() => {
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
        />

        <div className="layout">
          <HistoryPanel
            historySort={historySort}
            onChangeSort={(v) => setHistorySort(v)}
            items={historyItems}
            onPickQuestion={(q) => {
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
          />

          <ChatPanel
            lastQuestion={lastQuestion}
            answer={answer}
            isLoading={isLoading}
            queueStatus={queueStatus}
            messagesEndRef={messagesEndRef}
          />

          <DebugPanel
            debugInfo={debugInfo}
            ttsEnabled={ttsEnabled}
            questionQueue={questionQueue}
            onAnswerQueuedNow={(item) => answerQueuedNow(item)}
            onRemoveQueuedQuestion={(id) => removeQueuedQuestion(id)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
