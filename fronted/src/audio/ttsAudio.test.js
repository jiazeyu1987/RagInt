import {
  resampleMono,
  encodeWavPcm16Mono,
  decodeAndConvertToWav16kMono,
  playWavBytesViaDecodeAudioData,
  playWavStreamViaWebAudio,
  unlockAudio,
} from './ttsAudio';

describe('ttsAudio helpers', () => {
  test('resampleMono downsamples with interpolation', () => {
    const input = new Float32Array([0, 0.5, 1, 0.5]);
    const out = resampleMono(input, 48000, 16000);

    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(1);
    expect(out[0]).toBeCloseTo(0, 5);
  });

  test('encodeWavPcm16Mono writes wav header and pcm payload', () => {
    const wav = encodeWavPcm16Mono(new Float32Array([0, 0.5, -0.5]), 16000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    const readFourCc = (off) =>
      String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));

    expect(readFourCc(0)).toBe('RIFF');
    expect(readFourCc(8)).toBe('WAVE');
    expect(readFourCc(12)).toBe('fmt ');
    expect(readFourCc(36)).toBe('data');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(wav.byteLength).toBe(44 + 3 * 2);
  });

  test('decodeAndConvertToWav16kMono converts decoded audio to wav blob', async () => {
    const originalAudioContext = window.AudioContext;
    const close = jest.fn().mockResolvedValue(undefined);
    const decodeAudioData = jest.fn().mockResolvedValue({
      numberOfChannels: 2,
      sampleRate: 48000,
      length: 4,
      getChannelData: (ch) => (ch === 0 ? new Float32Array([0.1, 0.2, 0.3, 0.4]) : new Float32Array([0.2, 0.3, 0.4, 0.5])),
    });

    window.AudioContext = jest.fn().mockImplementation(() => ({
      decodeAudioData,
      close,
    }));

    const blob = {
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    };
    const out = await decodeAndConvertToWav16kMono(blob);

    expect(out).toBeInstanceOf(Blob);
    expect(out.type).toBe('audio/wav');
    expect(out.size).toBeGreaterThan(44);
    expect(close).toHaveBeenCalled();

    window.AudioContext = originalAudioContext;
  });

  test('playWavStreamViaWebAudio rejects missing url without fallback playback', async () => {
    const originalAudioContext = window.AudioContext;
    const originalFetch = global.fetch;
    window.AudioContext = undefined;
    global.fetch = jest.fn();

    await expect(
      playWavStreamViaWebAudio('', { current: null }, { current: null }, null)
    ).rejects.toThrow(/TTS stream URL is required/i);

    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch = originalFetch;
    window.AudioContext = originalAudioContext;
  });

  test('playWavStreamViaWebAudio fails streamed segment without refetch by default', async () => {
    const originalAudioContext = window.AudioContext;
    const originalFetch = global.fetch;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.AudioContext = jest.fn().mockImplementation(() => ({}));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });

    await expect(
      playWavStreamViaWebAudio(
        'https://unit.test/api/text_to_speech_stream?segment_index=0',
        { current: null },
        { current: null },
        null
      )
    ).rejects.toThrow(/WAV header/i);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[TTS] WebAudio streaming failed:', expect.any(Error));

    warnSpy.mockRestore();
    global.fetch = originalFetch;
    window.AudioContext = originalAudioContext;
  });

  test('playWavStreamViaWebAudio rejects stream failure without refetching same url', async () => {
    const originalAudioContext = window.AudioContext;
    const originalFetch = global.fetch;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.AudioContext = jest.fn().mockImplementation(() => ({
      state: 'running',
      decodeAudioData: jest.fn().mockRejectedValue(new Error('decode failed')),
    }));
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(44)),
      });

    await expect(
      playWavStreamViaWebAudio(
        'https://unit.test/api/text_to_speech_stream?segment_index=0',
        { current: null },
        { current: null },
        null,
        { playbackRate: 1 }
      )
    ).rejects.toThrow(/WAV header/i);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    global.fetch = originalFetch;
    window.AudioContext = originalAudioContext;
  });

  test('playWavStreamViaWebAudio rejects missing WebAudio', async () => {
    const originalAudioContext = window.AudioContext;
    window.AudioContext = undefined;

    await expect(
      playWavStreamViaWebAudio(
        'https://unit.test/api/text_to_speech_stream?segment_index=0',
        { current: null },
        { current: null },
        null
      )
    ).rejects.toThrow(/WebAudio is not supported/i);

    window.AudioContext = originalAudioContext;
  });

  test('playWavBytesViaDecodeAudioData rejects AudioContext sample-rate construction failure', async () => {
    const originalAudioContext = window.AudioContext;
    const wavBytes = encodeWavPcm16Mono(new Float32Array([0, 0.1, -0.1, 0]), 16000);
    const constructionError = new Error('sample-rate AudioContext rejected');
    const sourceNode = {
      playbackRate: { value: 1 },
      connect: jest.fn(),
      start: jest.fn(function start() {
        if (typeof sourceNode.onended === 'function') sourceNode.onended();
      }),
      stop: jest.fn(),
      onended: null,
    };

    window.AudioContext = jest.fn().mockImplementation((args) => {
      if (args && args.sampleRate) throw constructionError;
      return {
        state: 'running',
        sampleRate: 48000,
        decodeAudioData: jest.fn().mockResolvedValue({
          numberOfChannels: 1,
          sampleRate: 16000,
          length: 4,
          duration: 0.001,
          getChannelData: () => new Float32Array([0, 0.1, -0.1, 0]),
        }),
        createBufferSource: jest.fn().mockReturnValue(sourceNode),
        destination: {},
      };
    });

    await expect(
      playWavBytesViaDecodeAudioData(wavBytes, { current: null }, { current: null }, { playbackRate: 1 })
    ).rejects.toThrow(/sample-rate AudioContext rejected/i);

    expect(window.AudioContext).toHaveBeenCalledTimes(1);

    window.AudioContext = originalAudioContext;
  });

  test('playWavStreamViaWebAudio rejects target sample-rate AudioContext construction failure', async () => {
    const originalAudioContext = window.AudioContext;
    const originalFetch = global.fetch;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const wavHeader = encodeWavPcm16Mono(new Float32Array([]), 16000);
    const constructionError = new Error('stream AudioContext sample-rate rejected');
    window.AudioContext = jest.fn().mockImplementation((args) => {
      if (args && args.sampleRate) throw constructionError;
      return {
        state: 'running',
        sampleRate: 48000,
        currentTime: 0,
        destination: {},
        createBuffer: jest.fn(),
        createBufferSource: jest.fn(),
      };
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: wavHeader })
            .mockResolvedValueOnce({ done: true }),
        }),
      },
    });

    await expect(
      playWavStreamViaWebAudio(
        'https://unit.test/api/text_to_speech_stream?segment_index=0',
        { current: null },
        { current: null },
        null
      )
    ).rejects.toThrow(/stream AudioContext sample-rate rejected/i);

    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    global.fetch = originalFetch;
    window.AudioContext = originalAudioContext;
  });

  test('unlockAudio creates and resumes audio context', () => {
    const originalAudioContext = window.AudioContext;
    const resume = jest.fn().mockResolvedValue(undefined);
    const srcStart = jest.fn();
    const srcStop = jest.fn();

    window.AudioContext = jest.fn().mockImplementation(({ sampleRate } = {}) => ({
      sampleRate: sampleRate || 22050,
      state: 'suspended',
      resume,
      createBuffer: jest.fn().mockReturnValue({}),
      createBufferSource: jest.fn().mockReturnValue({
        connect: jest.fn(),
        start: srcStart,
        stop: srcStop,
      }),
      destination: {},
    }));

    const audioContextRef = { current: null };
    unlockAudio(audioContextRef, 16000);

    expect(window.AudioContext).toHaveBeenCalledWith({ sampleRate: 16000 });
    expect(audioContextRef.current).toBeTruthy();
    expect(resume).toHaveBeenCalled();
    expect(srcStart).toHaveBeenCalledWith(0);
    expect(srcStop).toHaveBeenCalledWith(0);

    window.AudioContext = originalAudioContext;
  });
});
