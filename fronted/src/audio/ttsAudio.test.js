import {
  resampleMono,
  encodeWavPcm16Mono,
  decodeAndConvertToWav16kMono,
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
