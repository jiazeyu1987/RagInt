jest.mock('../audio/ttsAudio', () => ({
  playWavBytesViaDecodeAudioData: jest.fn().mockResolvedValue(undefined),
  playWavStreamViaWebAudio: jest.fn().mockResolvedValue(undefined),
  playWavViaDecodeAudioData: jest.fn().mockResolvedValue(undefined),
}));

import { TtsQueueManager } from './TtsQueueManager';

describe('TtsQueueManager', () => {
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
});

