import { renderHook } from '../testUtils/renderHook';
import { useAppShellTtsManager } from './useAppShellTtsManager';
import { createOrGetTtsManager } from '../managers/createTtsManager';
import { createTtsOnStopIndexChange } from '../managers/createTtsOnStopIndexChange';

jest.mock('../managers/createTtsManager', () => ({
  createOrGetTtsManager: jest.fn(() => ({ id: 'tts-manager' })),
}));

jest.mock('../managers/createTtsOnStopIndexChange', () => ({
  createTtsOnStopIndexChange: jest.fn(() => jest.fn()),
}));

describe('useAppShellTtsManager', () => {
  beforeEach(() => {
    createOrGetTtsManager.mockClear();
    createOrGetTtsManager.mockReturnValue({ id: 'tts-manager' });
    createTtsOnStopIndexChange.mockClear();
    createTtsOnStopIndexChange.mockReturnValue(jest.fn());
  });

  function buildProps(overrides = {}) {
    const ttsManagerRef = {
      current: {
        enqueueText: jest.fn(),
        enqueueAudioUrl: jest.fn(),
        ensureRunning: jest.fn(),
      },
    };
    return {
      ttsManagerRef,
      audioContextRef: { current: null },
      currentAudioRef: { current: null },
      requestSeqRef: { current: 9 },
      clientIdRef: { current: 'client-1' },
      nowMs: jest.fn(() => 100),
      backendBase: 'http://backend.test',
      maxPreGenerateCount: 2,
      ttsFetchConcurrency: 3,
      ttsMode: 'flash',
      modelscopeVoice: 'longanyang',
      ttsSpeed: 1.25,
      emitClientEvent: jest.fn(),
      guideEnabledRef: { current: true },
      tourStateRef: { current: { stopIndex: 0 } },
      tourPipelineRef: { current: null },
      ttsEnabledRef: { current: true },
      getTourStopName: jest.fn(() => '展品 A'),
      setTourState: jest.fn(),
      setLastQuestion: jest.fn(),
      buildTourPrompt: jest.fn(),
      setAnswer: jest.fn(),
      playTourRecordingEnabledRef: { current: true },
      selectedTourRecordingIdRef: { current: 'rec-1' },
      interruptManagerRef: { current: null },
      debugRef: { current: {} },
      debugMark: jest.fn(),
      debugRefresh: jest.fn(),
      ...overrides,
    };
  }

  test('creates the TTS manager with app shell settings and client event metadata', () => {
    const props = buildProps();
    const hook = renderHook((nextProps) => useAppShellTtsManager(nextProps), props);

    expect(hook.result().getTtsManager()).toEqual({ id: 'tts-manager' });

    const options = createOrGetTtsManager.mock.calls[0][0];
    expect(options.ttsManagerRef).toBe(props.ttsManagerRef);
    expect(options.runIdRef).toBe(props.requestSeqRef);
    expect(options.baseUrl).toBe('http://backend.test');
    expect(options.useSavedTts).toBe(false);
    expect(options.maxPreGenerateCount).toBe(2);
    expect(options.fetchConcurrency).toBe(3);
    expect(options.ttsMode).toBe('flash');
    expect(options.ttsVoice).toBe('longanyang');
    expect(options.ttsSpeed).toBe(1.25);

    options.emitClientEvent({ type: 'tts' });
    expect(props.emitClientEvent).toHaveBeenCalledWith({ type: 'tts', clientId: 'client-1' });
  });

  test('wires stop-index callback helpers to the active manager', () => {
    const props = buildProps();
    const hook = renderHook((nextProps) => useAppShellTtsManager(nextProps), props);

    hook.result().getTtsManager();
    const stopOptions = createTtsOnStopIndexChange.mock.calls[0][0];

    stopOptions.enqueueSegment('hello', { stopIndex: 1 });
    stopOptions.enqueueAudioSegment('/a.mp3', { stopIndex: 1 });
    stopOptions.ensureTtsRunning();

    expect(props.ttsManagerRef.current.enqueueText).toHaveBeenCalledWith('hello', { stopIndex: 1 });
    expect(props.ttsManagerRef.current.enqueueAudioUrl).toHaveBeenCalledWith('/a.mp3', { stopIndex: 1 });
    expect(props.ttsManagerRef.current.ensureRunning).toHaveBeenCalledTimes(1);
    expect(stopOptions.getPlaybackRecordingId()).toBe('rec-1');
  });

  test('uses an empty voice for non-modelscope and non-flash providers', () => {
    const props = buildProps({ ttsMode: 'local', modelscopeVoice: 'ignored' });
    const hook = renderHook((nextProps) => useAppShellTtsManager(nextProps), props);

    hook.result().getTtsManager();

    expect(createOrGetTtsManager.mock.calls[0][0].ttsVoice).toBe('');
  });
});
