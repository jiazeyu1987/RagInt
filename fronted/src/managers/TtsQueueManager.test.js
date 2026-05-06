jest.mock('../audio/ttsAudio', () => ({
  playWavBytesViaDecodeAudioData: jest.fn().mockResolvedValue(undefined),
  playWavStreamViaWebAudio: jest.fn().mockResolvedValue(undefined),
  playWavViaDecodeAudioData: jest.fn().mockResolvedValue(undefined),
}));

import { TtsQueueManager } from './TtsQueueManager';
import { playWavBytesViaDecodeAudioData, playWavStreamViaWebAudio, playWavViaDecodeAudioData } from '../audio/ttsAudio';

describe('TtsQueueManager', () => {
  beforeEach(() => {
    playWavBytesViaDecodeAudioData.mockReset().mockResolvedValue(undefined);
    playWavStreamViaWebAudio.mockReset().mockResolvedValue(undefined);
    playWavViaDecodeAudioData.mockReset().mockResolvedValue(undefined);
    global.fetch = undefined;
  });

  test('enqueueText deduplicates and capture helpers return merged pending content', () => {
    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
    });

    const first = manager.enqueueText(' hello ', { stopIndex: 1 });
    const second = manager.enqueueText('hello', { stopIndex: 1 });

    expect(first).toEqual({ seq: 0, seg: 'hello', stopIndex: 1 });
    expect(second).toBeNull();

    manager._currentItem = { stopIndex: 1, text: 'now', url: 'https://audio/now.wav' };
    manager._audioQueue = [
      { stopIndex: 1, text: 'next', url: 'https://audio/next.wav' },
      { stopIndex: 2, text: 'other', url: 'https://audio/other.wav' },
    ];
    manager._textQueue.push('later');
    manager._metaQueue.push({ stopIndex: 1 });

    expect(manager.capturePendingTextByStopIndex(1)).toEqual(['now', 'next', 'hello', 'later']);
    expect(manager.capturePendingAudioByStopIndex(1)).toEqual([
      { audio_url: 'https://audio/now.wav', text: 'now' },
      { audio_url: 'https://audio/next.wav', text: 'next' },
    ]);
  });

  test('builds TTS segment url with run/client/voice fields', () => {
    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test/base',
      getClientId: () => 'client-1',
      ttsProvider: 'flash',
      ttsVoice: 'voice-a',
      recordingId: 'rec-1',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
    });
    manager._requestId = 'req-1';

    const url = manager._buildSegmentUrl('segment text', { stopIndex: 3 });
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/api/text_to_speech_stream');
    expect(parsed.searchParams.get('text')).toBe('segment text');
    expect(parsed.searchParams.get('request_id')).toBe('req-1');
    expect(parsed.searchParams.get('client_id')).toBe('client-1');
    expect(parsed.searchParams.get('tts_provider')).toBe('flash');
    expect(parsed.searchParams.get('tts_voice')).toBe('voice-a');
    expect(parsed.searchParams.get('recording_id')).toBe('rec-1');
    expect(parsed.searchParams.get('stop_index')).toBe('3');
    expect(parsed.searchParams.get('segment_index')).toBe('0');
  });

  test('builds same-origin TTS segment url when baseUrl is empty', () => {
    const manager = new TtsQueueManager({
      baseUrl: '',
      getClientId: () => 'client-2',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
    });
    manager._requestId = 'req-2';

    const url = manager._buildSegmentUrl('hello world', {});
    const parsed = new URL(url);

    expect(parsed.origin).toBe(window.location.origin);
    expect(parsed.pathname).toBe('/api/text_to_speech_stream');
    expect(parsed.searchParams.get('text')).toBe('hello world');
    expect(parsed.searchParams.get('request_id')).toBe('req-2');
    expect(parsed.searchParams.get('client_id')).toBe('client-2');
  });

  test('fails fast when building TTS segment url with invalid configured baseUrl', () => {
    const manager = new TtsQueueManager({
      baseUrl: 'http://[bad-host',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
    });
    manager._requestId = 'req-bad-base';

    expect(() => manager._buildSegmentUrl('hello world', {})).toThrow('Invalid TTS baseUrl');
  });

  test('setTtsSpeed updates current playback rate and profile', () => {
    const setPlaybackRate = jest.fn();
    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test',
      ttsProvider: 'modelscope',
      ttsVoice: 'voice-b',
      ttsSpeed: 1.0,
      currentAudioRef: { current: { setPlaybackRate } },
      audioContextRef: { current: null },
    });

    manager.setTtsSpeed(1.5, 'speed_changed');

    expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(manager.getTtsProfile()).toEqual({
      provider: 'modelscope',
      voice: 'voice-b',
      speed: 1.5,
    });
  });

  test('resolve playback url normalizes same-host url to configured backend origin', () => {
    const manager = new TtsQueueManager({
      baseUrl: 'http://172.30.30.58:4981',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
    });

    const out = manager._resolvePlaybackUrl('http://172.30.30.58/api/recordings/rec_1/audio/a.wav?v=1');
    expect(out).toBe('http://172.30.30.58:4981/api/recordings/rec_1/audio/a.wav?v=1');
  });

  test('fails fast when resolving playback url with invalid configured baseUrl', () => {
    const manager = new TtsQueueManager({
      baseUrl: 'http://[bad-host',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
    });

    expect(() => manager._resolvePlaybackUrl('/api/recordings/rec_1/audio/a.wav')).toThrow('Invalid TTS baseUrl');
  });

  test('fails fast when fetch concurrency is explicitly unsupported', () => {
    expect(
      () =>
        new TtsQueueManager({
          baseUrl: 'https://unit.test',
          fetchConcurrency: 3,
          currentAudioRef: { current: null },
          audioContextRef: { current: null },
        })
    ).toThrow('Invalid TTS fetchConcurrency');

    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
    });

    expect(() => manager.setFetchConcurrency(3, 'ui_change')).toThrow('Invalid TTS fetchConcurrency');
  });

  test('stop emits play_cancelled for active request and clears current audio', () => {
    const emitClientEvent = jest.fn();
    const stopAudio = jest.fn();
    const currentAudioRef = { current: { stop: stopAudio } };
    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test',
      getClientId: () => 'client-2',
      currentAudioRef,
      audioContextRef: { current: null },
      emitClientEvent,
    });

    manager.resetForRun({ requestId: 'req-stop' });
    manager.enqueueText('line 1');
    manager.stop('manual');

    expect(stopAudio).toHaveBeenCalledTimes(1);
    expect(currentAudioRef.current).toBeNull();
    expect(emitClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-stop',
        clientId: 'client-2',
        kind: 'client',
        name: 'play_cancelled',
        fields: { reason: 'manual' },
      })
    );
    expect(manager.isBusy()).toBe(false);
  });

  test('prefetched wav byte decode failure rejects idle wait without refetching same url', async () => {
    playWavBytesViaDecodeAudioData.mockRejectedValueOnce(new Error('decode failed'));
    const onError = jest.fn();
    const onWarn = jest.fn();
    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
      onError,
      onWarn,
    });
    manager.resetForRun({ requestId: 'req-prefetched' });
    manager._audioQueue.push({
      seq: 0,
      stopIndex: 0,
      text: 'prefetched',
      url: 'https://unit.test/api/text_to_speech_stream?segment_index=0',
      wavBytes: new Uint8Array([1, 2, 3, 4]),
      prefetchState: 'ready',
    });
    manager.markRagDone();

    manager.ensureRunning();
    await expect(manager.waitForIdle()).rejects.toThrow('decode failed');

    expect(playWavBytesViaDecodeAudioData).toHaveBeenCalledTimes(1);
    expect(playWavStreamViaWebAudio).not.toHaveBeenCalled();
    expect(playWavViaDecodeAudioData).not.toHaveBeenCalled();
    expect(onWarn).toHaveBeenCalledWith('[TTSQ] prefetched_wav_playback_failed', expect.any(Error));
    expect(onError).toHaveBeenCalledWith('[TTSQ] player_error', expect.any(Error));
  });

  test('prefetch failure rejects idle wait without falling back to streaming playback', async () => {
    const prefetchError = new Error('prefetch network down');
    global.fetch = jest.fn().mockRejectedValue(prefetchError);
    const onError = jest.fn();
    const onWarn = jest.fn();
    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
      onError,
      onWarn,
      prefetchTimeoutMs: 3000,
    });
    manager.resetForRun({ requestId: 'req-prefetch-fail' });
    manager._audioQueue.push({
      seq: 0,
      stopIndex: 0,
      text: 'must prefetch',
      url: 'https://unit.test/api/text_to_speech_stream?segment_index=0',
      prefetchState: 'new',
    });
    manager.markRagDone();

    manager.ensureRunning();
    await expect(manager.waitForIdle()).rejects.toThrow('prefetch network down');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(playWavStreamViaWebAudio).not.toHaveBeenCalled();
    expect(playWavBytesViaDecodeAudioData).not.toHaveBeenCalled();
    expect(onWarn).toHaveBeenCalledWith('[TTSQ] prefetch_failed', prefetchError);
    expect(onError).toHaveBeenCalledWith('[TTSQ] player_error', expect.any(Error));
    expect(manager.isBusy()).toBe(false);
  });

  test('stream playback call does not pass refetch or audio element fallback controls', async () => {
    const currentAudioRef = { current: null };
    const audioContextRef = { current: null };
    const manager = new TtsQueueManager({
      baseUrl: 'https://unit.test',
      currentAudioRef,
      audioContextRef,
      ttsSpeed: 1.25,
    });
    manager.resetForRun({ requestId: 'req-stream-contract' });
    manager._canPrefetch = () => false;
    manager._isItemReadyForPlayback = () => true;
    manager._audioQueue.push({
      seq: 0,
      stopIndex: 0,
      text: 'stream me',
      url: 'https://unit.test/api/text_to_speech_stream?segment_index=0',
      prefetchState: 'new',
    });
    manager.markRagDone();

    manager.ensureRunning();
    await manager.waitForIdle();

    expect(playWavStreamViaWebAudio).toHaveBeenCalledTimes(1);
    expect(playWavStreamViaWebAudio).toHaveBeenCalledWith(
      'https://unit.test/api/text_to_speech_stream?segment_index=0',
      audioContextRef,
      currentAudioRef,
      expect.any(Function),
      { playbackRate: 1.25 }
    );
    expect(playWavStreamViaWebAudio.mock.calls[0]).toHaveLength(5);
  });

  test('generator dependency failures reject idle wait instead of completing silently', async () => {
    const onError = jest.fn();
    const manager = new TtsQueueManager({
      baseUrl: 'http://[bad-host',
      currentAudioRef: { current: null },
      audioContextRef: { current: null },
      onError,
    });
    manager.resetForRun({ requestId: 'req-generator-fail' });
    manager.enqueueText('must fail');
    manager.markRagDone();

    manager.ensureRunning();
    await expect(manager.waitForIdle()).rejects.toThrow('Invalid TTS baseUrl');

    expect(onError).toHaveBeenCalledWith('[TTSQ] generator_error', expect.any(Error));
    expect(manager.isBusy()).toBe(false);
  });
});

