import { renderHook } from '../testUtils/renderHook';
import { useStateRefsSync } from './useStateRefsSync';

function buildProps(overrides = {}) {
  return {
    continuousTour: true,
    continuousTourRef: { current: false },
    tourRecordingEnabled: true,
    tourRecordingEnabledRef: { current: false },
    playTourRecordingEnabled: false,
    playTourRecordingEnabledRef: { current: true },
    selectedTourRecordingId: ' rec-1 ',
    selectedTourRecordingIdRef: { current: '' },
    guideEnabled: true,
    guideEnabledRef: { current: false },
    tourState: { mode: 'running' },
    tourStateRef: { current: null },
    tourStops: ['A', 'B'],
    tourStopsRef: { current: [] },
    tourZone: ' Zone-1 ',
    tourZoneRef: { current: '' },
    tourStopDurations: [10, 20],
    tourStopDurationsRef: { current: [] },
    tourStopTargetChars: [100, 200],
    tourStopTargetCharsRef: { current: [] },
    audienceProfile: ' General ',
    audienceProfileRef: { current: '' },
    tourMeta: { zones: ['z'] },
    tourMetaRef: { current: null },
    guideDuration: '30',
    guideDurationRef: { current: '' },
    guideStyle: 'friendly',
    guideStyleRef: { current: '' },
    qaAnswerTargetChars: '120',
    qaAnswerTargetCharsRef: { current: '' },
    qaAudioCacheLookupEnabled: true,
    qaAudioCacheLookupEnabledRef: { current: false },
    qaAudioCacheConfidenceThreshold: 1.2,
    qaAudioCacheConfidenceThresholdRef: { current: '' },
    tourTemplateId: 'tpl-1',
    tourTemplateIdRef: { current: '' },
    tourStopsOverride: ['A'],
    tourStopsOverrideRef: { current: [] },
    tourStopDurationsOverride: { A: 12 },
    tourStopDurationsOverrideRef: { current: {} },
    tourStopPromptOverrides: { A: 'focus' },
    tourStopPromptOverridesRef: { current: {} },
    useAgentMode: true,
    useAgentModeRef: { current: false },
    selectedChat: 'chat-1',
    selectedChatRef: { current: '' },
    selectedAgentId: 'agent-1',
    selectedAgentIdRef: { current: '' },
    groupMode: true,
    groupModeRef: { current: false },
    questionQueue: [{ id: 'q1' }],
    queueRef: { current: [] },
    ...overrides,
  };
}

describe('useStateRefsSync', () => {
  test('syncs state values into refs with normalization', async () => {
    const props = buildProps();
    const hook = renderHook((p) => {
      useStateRefsSync(p);
      return null;
    }, props);

    await hook.flush();

    expect(props.continuousTourRef.current).toBe(true);
    expect(props.tourRecordingEnabledRef.current).toBe(true);
    expect(props.playTourRecordingEnabledRef.current).toBe(false);
    expect(props.selectedTourRecordingIdRef.current).toBe('rec-1');
    expect(props.tourStopsRef.current).toEqual(['A', 'B']);
    expect(props.tourZoneRef.current).toBe('Zone-1');
    expect(props.audienceProfileRef.current).toBe('General');
    expect(props.qaAudioCacheConfidenceThresholdRef.current).toBe('1');
    expect(props.useAgentModeRef.current).toBe(true);
    expect(props.queueRef.current).toEqual([{ id: 'q1' }]);

    hook.unmount();
  });
});

