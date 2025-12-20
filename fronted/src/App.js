import React, { useState, useRef } from 'react';
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

async function playWavStreamViaWebAudio(url, audioContextRef, currentAudioRef, fallbackPlay) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    if (fallbackPlay) return fallbackPlay();
    throw new Error('WebAudio is not supported');
  }

  const abortController = new AbortController();
  let audioCtx = null;
  let processor = null;
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

    const ensureAudioContext = async (targetSampleRate) => {
      if (audioContextRef.current && audioContextRef.current.sampleRate !== targetSampleRate) {
        try {
          await audioContextRef.current.close();
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
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
        } catch (_) {
          // ignore
        }
      }
    };

    const ensureProcessor = () => {
      if (!audioCtx || !wavInfo) return;
      if (processor) return;
      const bufferSize = 2048;
      processor = audioCtx.createScriptProcessor(bufferSize, 0, wavInfo.channels);
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
        await ensureAudioContext(wavInfo.sampleRate);
        ensureResampler();
        ensureProcessor();

        const dataStart = wavInfo.dataOffset;
        if (headerBuffer.byteLength > dataStart) enqueuePcmChunk(headerBuffer.slice(dataStart));
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
    throw err;
  } finally {
    stopPlayback();
    stopAllSources();
  }
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // 原始文本队列和预生成音频队列
  const ttsTextQueueRef = useRef([]);
  const ttsAudioQueueRef = useRef([]);

  // 工作线程引用
  const ttsGeneratorPromiseRef = useRef(null);
  const ttsPlayerPromiseRef = useRef(null);

  const ragflowDoneRef = useRef(false);
  const runIdRef = useRef(0);
  const currentAudioRef = useRef(null);
  const receivedSegmentsRef = useRef(false);
  const audioContextRef = useRef(null);
  const USE_SAVED_TTS = false;

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        stream.getTracks().forEach(track => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);

      const response = await fetch('http://localhost:8000/api/speech_to_text', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      const text = result.text || '';

      if (text) {
        await askQuestion(text);
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error processing audio:', err);
      setIsLoading(false);
    }
  };

  const askQuestion = async (text) => {
    const runId = ++runIdRef.current;
    const requestId = `ask_${runId}_${Date.now()}`;
    let segmentIndex = 0;
    setQuestion(text);
    setAnswer('');
    setIsLoading(true);

    // 清空所有队列
    ttsTextQueueRef.current = [];
    ttsAudioQueueRef.current = [];
    ragflowDoneRef.current = false;
    receivedSegmentsRef.current = false;

    // 启动状态监控
    startStatusMonitor(runId);

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

    // Reset WebAudio between questions to avoid stale audio graph causing noise on subsequent runs.
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch (_) {
        // ignore
      }
      audioContextRef.current = null;
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
        console.log(`🎵 开始生成音频: "${segmentText.substring(0, 30)}..."`);
        const seg = String(segmentText || '').trim();
        if (!seg) return null;
        const url = new URL(USE_SAVED_TTS ? 'http://localhost:8000/api/text_to_speech_saved' : 'http://localhost:8000/api/text_to_speech_stream');
        url.searchParams.set('text', seg);
        url.searchParams.set('request_id', requestId);
        url.searchParams.set('segment_index', String(segmentIndex++));
        return url.toString();


        console.log(`✅ 音频生成完成: ${audioBlob.size} bytes`);
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
          const audioUrl = generateAudioSegmentUrl(nextSegment);

          if (audioUrl) {
            ttsAudioQueueRef.current.push({
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

          if (USE_SAVED_TTS) {
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
              () => playAudioUrl(audioItem.url, audioItem.text)
            );
          }
        }
      })()
        .catch((err) => {
          console.error('❌ TTS播放线程出错:', err);
        })
        .finally(() => {
          if (runIdRef.current === runId) {
            setIsLoading(false);
          }
          ttsPlayerPromiseRef.current = null;
        });
    };

    try {
      const response = await fetch('http://localhost:8000/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: text, request_id: requestId })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = '';
      let sseBuffer = '';

      while (true) {
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
              if (data.chunk && !data.done) {
                fullAnswer += data.chunk;
                setAnswer(fullAnswer);
              }

              if (data.segment && !data.done) {
                const seg = String(data.segment).trim();
                if (seg) {
                  receivedSegmentsRef.current = true;
                  ttsTextQueueRef.current.push(seg);
                  console.log(`📝 收到文本段落: "${seg.substring(0, 30)}..."`);
                  startTTSGenerator();
                }
              }

              if (data.done) {
                if (!receivedSegmentsRef.current && fullAnswer.trim()) {
                  ttsTextQueueRef.current.push(fullAnswer.trim());
                  console.log(`📝 收到完整文本: "${fullAnswer.substring(0, 30)}..."`);
                }
                ragflowDoneRef.current = true;
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
                return;
              }
            } catch (err) {
              console.error('Error parsing chunk:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error asking question:', err);
      setIsLoading(false);
    }
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (question.trim() && !isLoading) {
      await askQuestion(question);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1>AI语音问答</h1>

        <div className="input-section">
          <div className="voice-input">
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isLoading}
            >
              {isRecording ? '🔴 录音中...' : '🎤 按住说话'}
            </button>
          </div>

          <form className="text-input" onSubmit={handleTextSubmit}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="或者输入文字问题..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading}>
              发送
            </button>
          </form>
        </div>

        {question && (
          <div className="question-section">
            <h3>问题: {question}</h3>
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
      </div>
    </div>
  );
}

export default App;
