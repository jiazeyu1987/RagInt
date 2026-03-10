import { renderHook } from '../testUtils/renderHook';
import { useTourPipelineManager } from './useTourPipelineManager';

let mockLastPipeline = null;

jest.mock('../managers/TourPipelineManager', () => ({
  TourPipelineManager: function TourPipelineManagerMock(opts) {
    this.opts = opts;
    this.abortPrefetch = jest.fn();
    mockLastPipeline = this;
  },
}));

describe('useTourPipelineManager', () => {
  beforeEach(() => {
    mockLastPipeline = null;
  });

  test('creates pipeline lazily and exposes abortPrefetch bridge', () => {
    const refs = {
      clientIdRef: { current: 'client-1' },
      tourStopsRef: { current: ['A', 'B'] },
      tourStateRef: { current: { lastAnswerTail: 'tail' } },
      audienceProfileRef: { current: 'general' },
      guideDurationRef: { current: '10' },
      guideStyleRef: { current: 'friendly' },
      guideEnabledRef: { current: true },
      tourStopDurationsRef: { current: [11, 22] },
      tourStopTargetCharsRef: { current: [100, 120] },
      tourStopPromptOverridesRef: { current: { A: 'pA' } },
      continuousTourRef: { current: false },
      tourRecordingEnabledRef: { current: true },
      activeTourRecordingIdRef: { current: 'rec_1' },
      playTourRecordingEnabledRef: { current: false },
      selectedTourRecordingIdRef: { current: 'rec_play' },
      interruptManagerRef: { current: { snapshot: () => 9, isCurrent: () => true } },
      useAgentModeRef: { current: true },
      selectedChatRef: { current: 'chat-x' },
      selectedAgentIdRef: { current: 'agent-x' },
    };

    const hook = renderHook(() =>
      useTourPipelineManager({
        baseUrl: 'http://unit.test',
        ...refs,
        maxPrefetchAhead: 2,
        onLog: jest.fn(),
        onWarn: jest.fn(),
      })
    );

    hook.result().abortPrefetch('before_create');
    expect(mockLastPipeline).toBeNull();

    const pipeline = hook.result().getTourPipeline();
    expect(pipeline).toBeTruthy();
    expect(hook.result().tourPipelineRef.current).toBe(pipeline);

    hook.result().abortPrefetch('manual');
    expect(pipeline.abortPrefetch).toHaveBeenCalledWith('manual');

    const opts = pipeline.opts;
    expect(opts.baseUrl).toBe('http://unit.test');
    expect(opts.getClientId()).toBe('client-1');
    expect(opts.getStops()).toEqual(['A', 'B']);
    expect(opts.getLastAnswerTail()).toBe('tail');
    expect(opts.getPerStopDurations()).toEqual([11, 22]);
    expect(opts.getPerStopTargetChars()).toEqual([100, 120]);
    expect(opts.getPerStopPrompts()).toEqual({ A: 'pA' });
    expect(opts.getRecordingId()).toBe('rec_1');
    expect(opts.getPlaybackRecordingId()).toBe('');
    expect(opts.maxPrefetchAhead).toBe(2);
    expect(opts.getConversationConfig()).toEqual({
      useAgentMode: true,
      selectedChat: null,
      selectedAgentId: 'agent-x',
    });
    hook.unmount();
  });
});
