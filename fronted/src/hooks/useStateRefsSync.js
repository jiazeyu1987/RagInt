import { useEffect } from 'react';

export function useStateRefsSync({
  continuousTour,
  continuousTourRef,
  tourRecordingEnabled,
  tourRecordingEnabledRef,
  playTourRecordingEnabled,
  playTourRecordingEnabledRef,
  selectedTourRecordingId,
  selectedTourRecordingIdRef,
  guideEnabled,
  guideEnabledRef,
  tourState,
  tourStateRef,
  tourStops,
  tourStopsRef,
  tourZone,
  tourZoneRef,
  tourStopDurations,
  tourStopDurationsRef,
  tourStopTargetChars,
  tourStopTargetCharsRef,
  audienceProfile,
  audienceProfileRef,
  tourMeta,
  tourMetaRef,
  guideDuration,
  guideDurationRef,
  guideStyle,
  guideStyleRef,
  qaAnswerTargetChars,
  qaAnswerTargetCharsRef,
  qaAudioCacheLookupEnabled,
  qaAudioCacheLookupEnabledRef,
  qaAudioCacheConfidenceThreshold,
  qaAudioCacheConfidenceThresholdRef,
  tourTemplateId,
  tourTemplateIdRef,
  tourStopsOverride,
  tourStopsOverrideRef,
  tourStopDurationsOverride,
  tourStopDurationsOverrideRef,
  tourStopPromptOverrides,
  tourStopPromptOverridesRef,
  useAgentMode,
  useAgentModeRef,
  selectedChat,
  selectedChatRef,
  selectedAgentId,
  selectedAgentIdRef,
  groupMode,
  groupModeRef,
  questionQueue,
  queueRef,
  globalPromptPrefix,
  globalPromptPrefixRef,
  asrConversationContextStrategy,
  asrConversationContextStrategyRef,
  asrConversationContextRecentTurns,
  asrConversationContextRecentTurnsRef,
  asrConversationContextMaxTokens,
  asrConversationContextMaxTokensRef,
} = {}) {
  useEffect(() => {
    continuousTourRef.current = !!continuousTour;
    tourRecordingEnabledRef.current = !!tourRecordingEnabled;
    playTourRecordingEnabledRef.current = !!playTourRecordingEnabled;
    selectedTourRecordingIdRef.current = String(selectedTourRecordingId || '').trim();
    guideEnabledRef.current = !!guideEnabled;
    tourStateRef.current = tourState;
    tourStopsRef.current = Array.isArray(tourStops) ? tourStops : [];
    tourZoneRef.current = String(tourZone || '').trim();
    tourStopDurationsRef.current = Array.isArray(tourStopDurations) ? tourStopDurations : [];
    tourStopTargetCharsRef.current = Array.isArray(tourStopTargetChars) ? tourStopTargetChars : [];
    audienceProfileRef.current = String(audienceProfile || '').trim();
    tourMetaRef.current = tourMeta;
    guideDurationRef.current = guideDuration;
    guideStyleRef.current = guideStyle;
    qaAnswerTargetCharsRef.current = String(qaAnswerTargetChars || '1');
    qaAudioCacheLookupEnabledRef.current = !!qaAudioCacheLookupEnabled;
    const n = Number(qaAudioCacheConfidenceThreshold);
    qaAudioCacheConfidenceThresholdRef.current = Number.isFinite(n) ? String(Math.max(0, Math.min(1, n))) : '0.85';
    tourTemplateIdRef.current = String(tourTemplateId || '');
    tourStopsOverrideRef.current = Array.isArray(tourStopsOverride) ? tourStopsOverride : [];
    tourStopDurationsOverrideRef.current =
      tourStopDurationsOverride && typeof tourStopDurationsOverride === 'object' && !Array.isArray(tourStopDurationsOverride)
        ? tourStopDurationsOverride
        : {};
    tourStopPromptOverridesRef.current =
      tourStopPromptOverrides &&
      typeof tourStopPromptOverrides === 'object' &&
      !Array.isArray(tourStopPromptOverrides)
        ? tourStopPromptOverrides
        : {};
    useAgentModeRef.current = !!useAgentMode;
    selectedChatRef.current = selectedChat;
    selectedAgentIdRef.current = selectedAgentId;
    groupModeRef.current = !!groupMode;
    queueRef.current = Array.isArray(questionQueue) ? questionQueue : [];
    globalPromptPrefixRef.current = String(globalPromptPrefix || '');
    asrConversationContextStrategyRef.current = String(asrConversationContextStrategy || 'smart_recent_current')
      .trim()
      .toLowerCase();
    if (!asrConversationContextStrategyRef.current) {
      asrConversationContextStrategyRef.current = 'smart_recent_current';
    }
    const recentTurns = Number(asrConversationContextRecentTurns);
    asrConversationContextRecentTurnsRef.current = Number.isFinite(recentTurns) ? recentTurns : 10;
    const maxTokens = Number(asrConversationContextMaxTokens);
    asrConversationContextMaxTokensRef.current = Number.isFinite(maxTokens) ? maxTokens : 16000;
  }, [
    asrConversationContextMaxTokens,
    asrConversationContextMaxTokensRef,
    asrConversationContextRecentTurns,
    asrConversationContextRecentTurnsRef,
    asrConversationContextStrategy,
    asrConversationContextStrategyRef,
    audienceProfile,
    audienceProfileRef,
    continuousTour,
    continuousTourRef,
    globalPromptPrefix,
    globalPromptPrefixRef,
    groupMode,
    groupModeRef,
    guideDuration,
    guideDurationRef,
    guideEnabled,
    guideEnabledRef,
    guideStyle,
    guideStyleRef,
    playTourRecordingEnabled,
    playTourRecordingEnabledRef,
    qaAnswerTargetChars,
    qaAnswerTargetCharsRef,
    qaAudioCacheConfidenceThreshold,
    qaAudioCacheConfidenceThresholdRef,
    qaAudioCacheLookupEnabled,
    qaAudioCacheLookupEnabledRef,
    questionQueue,
    queueRef,
    selectedAgentId,
    selectedAgentIdRef,
    selectedChat,
    selectedChatRef,
    selectedTourRecordingId,
    selectedTourRecordingIdRef,
    tourMeta,
    tourMetaRef,
    tourRecordingEnabled,
    tourRecordingEnabledRef,
    tourState,
    tourStateRef,
    tourStopDurations,
    tourStopDurationsOverride,
    tourStopDurationsOverrideRef,
    tourStopDurationsRef,
    tourStopPromptOverrides,
    tourStopPromptOverridesRef,
    tourStopTargetChars,
    tourStopTargetCharsRef,
    tourStops,
    tourStopsOverride,
    tourStopsOverrideRef,
    tourStopsRef,
    tourTemplateId,
    tourTemplateIdRef,
    tourZone,
    tourZoneRef,
    useAgentMode,
    useAgentModeRef,
  ]);
}
