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
} = {}) {
  useEffect(() => {
    continuousTourRef.current = !!continuousTour;
  }, [continuousTour, continuousTourRef]);

  useEffect(() => {
    tourRecordingEnabledRef.current = !!tourRecordingEnabled;
  }, [tourRecordingEnabled, tourRecordingEnabledRef]);

  useEffect(() => {
    playTourRecordingEnabledRef.current = !!playTourRecordingEnabled;
  }, [playTourRecordingEnabled, playTourRecordingEnabledRef]);

  useEffect(() => {
    selectedTourRecordingIdRef.current = String(selectedTourRecordingId || '').trim();
  }, [selectedTourRecordingId, selectedTourRecordingIdRef]);

  useEffect(() => {
    guideEnabledRef.current = !!guideEnabled;
  }, [guideEnabled, guideEnabledRef]);

  useEffect(() => {
    tourStateRef.current = tourState;
  }, [tourState, tourStateRef]);

  useEffect(() => {
    tourStopsRef.current = Array.isArray(tourStops) ? tourStops : [];
  }, [tourStops, tourStopsRef]);

  useEffect(() => {
    tourZoneRef.current = String(tourZone || '').trim();
  }, [tourZone, tourZoneRef]);

  useEffect(() => {
    tourStopDurationsRef.current = Array.isArray(tourStopDurations) ? tourStopDurations : [];
  }, [tourStopDurations, tourStopDurationsRef]);

  useEffect(() => {
    tourStopTargetCharsRef.current = Array.isArray(tourStopTargetChars) ? tourStopTargetChars : [];
  }, [tourStopTargetChars, tourStopTargetCharsRef]);

  useEffect(() => {
    audienceProfileRef.current = String(audienceProfile || '').trim();
  }, [audienceProfile, audienceProfileRef]);

  useEffect(() => {
    tourMetaRef.current = tourMeta;
  }, [tourMeta, tourMetaRef]);

  useEffect(() => {
    guideDurationRef.current = guideDuration;
    guideStyleRef.current = guideStyle;
  }, [guideDuration, guideStyle, guideDurationRef, guideStyleRef]);

  useEffect(() => {
    qaAnswerTargetCharsRef.current = String(qaAnswerTargetChars || '1');
  }, [qaAnswerTargetChars, qaAnswerTargetCharsRef]);

  useEffect(() => {
    qaAudioCacheLookupEnabledRef.current = !!qaAudioCacheLookupEnabled;
  }, [qaAudioCacheLookupEnabled, qaAudioCacheLookupEnabledRef]);

  useEffect(() => {
    const n = Number(qaAudioCacheConfidenceThreshold);
    qaAudioCacheConfidenceThresholdRef.current = Number.isFinite(n) ? String(Math.max(0, Math.min(1, n))) : '0.85';
  }, [qaAudioCacheConfidenceThreshold, qaAudioCacheConfidenceThresholdRef]);

  useEffect(() => {
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
  }, [
    tourTemplateId,
    tourStopsOverride,
    tourStopDurationsOverride,
    tourStopPromptOverrides,
    tourTemplateIdRef,
    tourStopsOverrideRef,
    tourStopDurationsOverrideRef,
    tourStopPromptOverridesRef,
  ]);

  useEffect(() => {
    useAgentModeRef.current = !!useAgentMode;
  }, [useAgentMode, useAgentModeRef]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat, selectedChatRef]);

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId, selectedAgentIdRef]);

  useEffect(() => {
    groupModeRef.current = !!groupMode;
  }, [groupMode, groupModeRef]);

  useEffect(() => {
    queueRef.current = Array.isArray(questionQueue) ? questionQueue : [];
  }, [questionQueue, queueRef]);
}
