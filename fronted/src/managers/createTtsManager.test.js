import { createOrGetTtsManager } from './createTtsManager';
import { TtsQueueManager } from './TtsQueueManager';

jest.mock('./TtsQueueManager', () => ({
  TtsQueueManager: jest.fn().mockImplementation(function TtsQueueManagerMock(opts) {
    this.opts = opts;
  }),
}));

describe('createOrGetTtsManager', () => {
  beforeEach(() => {
    TtsQueueManager.mockClear();
  });

  test('throws when ttsManagerRef is missing', () => {
    expect(() => createOrGetTtsManager({})).toThrow('createOrGetTtsManager: missing ttsManagerRef');
  });

  test('creates manager once and reuses existing instance', () => {
    const ttsManagerRef = { current: null };
    const runIdRef = { current: 7 };
    const clientIdRef = { current: 'client-1' };
    const debugRef = { current: { segments: [] } };
    const debugMark = jest.fn();
    const debugRefresh = jest.fn();

    const first = createOrGetTtsManager({
      ttsManagerRef,
      runIdRef,
      clientIdRef,
      baseUrl: 'http://unit.test',
      ttsMode: 'flash',
      ttsVoice: 'longanyang',
      ttsSpeed: 1.2,
      debugRef,
      debugMark,
      debugRefresh,
      nowMs: () => 1000,
    });
    const second = createOrGetTtsManager({
      ttsManagerRef,
      runIdRef,
      clientIdRef,
    });

    expect(first).toBe(second);
    expect(TtsQueueManager).toHaveBeenCalledTimes(1);

    const opts = TtsQueueManager.mock.calls[0][0];
    expect(opts.baseUrl).toBe('http://unit.test');
    expect(opts.ttsProvider).toBe('flash');
    expect(opts.ttsVoice).toBe('longanyang');
    expect(opts.ttsSpeed).toBe(1.2);
    expect(opts.getRunId()).toBe(7);
    expect(opts.getClientId()).toBe('client-1');
  });

  test('wires debug events to debugRef timeline', () => {
    const ttsManagerRef = { current: null };
    const debugRef = { current: { segments: [], ttsFirstRequestAt: null } };
    const debugMark = jest.fn();
    const debugRefresh = jest.fn();

    createOrGetTtsManager({
      ttsManagerRef,
      debugRef,
      debugMark,
      debugRefresh,
      nowMs: () => 1234,
    });

    const opts = TtsQueueManager.mock.calls[0][0];
    opts.onDebug({ type: 'enqueue', seq: 3, chars: 12, t: 100 });
    opts.onDebug({ type: 'tts_request', seq: 3, t: 110 });
    opts.onDebug({ type: 'tts_first_audio', seq: 3, t: 120 });
    opts.onDebug({ type: 'tts_done', seq: 3, t: 130 });

    expect(debugRef.current.segments).toHaveLength(1);
    expect(debugRef.current.segments[0]).toEqual(
      expect.objectContaining({
        seq: 3,
        chars: 12,
        ttsRequestAt: 110,
        ttsFirstAudioAt: 120,
        ttsDoneAt: 130,
      })
    );
    expect(debugRef.current.ttsFirstRequestAt).toBe(110);
    expect(debugMark).toHaveBeenCalledWith('ttsFirstAudioAt', 120);
    expect(debugRefresh).toHaveBeenCalled();
  });
});
