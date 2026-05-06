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
    globalPromptPrefix: ' 全局提示 ',
    globalPromptPrefixRef: { current: '' },
    asrConversationContextStrategy: ' SMART_RECENT_CURRENT ',
    asrConversationContextStrategyRef: { current: '' },
    asrConversationContextRecentTurns: '12',
    asrConversationContextRecentTurnsRef: { current: 0 },
    asrConversationContextMaxTokens: '24000',
    asrConversationContextMaxTokensRef: { current: 0 },
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
    expect(props.globalPromptPrefixRef.current).toBe(' 全局提示 ');
    expect(props.asrConversationContextStrategyRef.current).toBe('smart_recent_current');
    expect(props.asrConversationContextRecentTurnsRef.current).toBe(12);
    expect(props.asrConversationContextMaxTokensRef.current).toBe(24000);

    hook.unmount();
  });

  test('uses conversation context defaults when numeric settings are invalid', async () => {
    const props = buildProps({
      asrConversationContextStrategy: '',
      asrConversationContextRecentTurns: 'bad',
      asrConversationContextMaxTokens: 'bad',
    });
    const hook = renderHook((p) => {
      useStateRefsSync(p);
      return null;
    }, props);

    await hook.flush();

    expect(props.asrConversationContextStrategyRef.current).toBe('smart_recent_current');
    expect(props.asrConversationContextRecentTurnsRef.current).toBe(10);
    expect(props.asrConversationContextMaxTokensRef.current).toBe(16000);

    hook.unmount();
  });

  test('resyncs refs after state changes without keeping stale normalized values', async () => {
    const props = buildProps();
    const hook = renderHook((p) => {
      useStateRefsSync(p);
      return null;
    }, props);

    await hook.flush();

    hook.updateProps({
      continuousTour: false,
      selectedTourRecordingId: ' rec-2 ',
      tourStops: 'invalid',
      tourZone: ' Zone-2 ',
      tourStopDurationsOverride: [],
      tourStopPromptOverrides: null,
      questionQueue: 'invalid',
      qaAudioCacheConfidenceThreshold: -0.2,
      asrConversationContextStrategy: '  ALL_HISTORY  ',
    });
    await hook.flush();

    expect(props.continuousTourRef.current).toBe(false);
    expect(props.selectedTourRecordingIdRef.current).toBe('rec-2');
    expect(props.tourStopsRef.current).toEqual([]);
    expect(props.tourZoneRef.current).toBe('Zone-2');
    expect(props.tourStopDurationsOverrideRef.current).toEqual({});
    expect(props.tourStopPromptOverridesRef.current).toEqual({});
    expect(props.queueRef.current).toEqual([]);
    expect(props.qaAudioCacheConfidenceThresholdRef.current).toBe('0');
    expect(props.asrConversationContextStrategyRef.current).toBe('all_history');

    hook.unmount();
  });
});

