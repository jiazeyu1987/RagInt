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
  tourMode,
  tourModeRef,
  tourTemplateId,
  tourTemplateIdRef,
  tourStopsOverride,
  tourStopsOverrideRef,
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
    tourModeRef.current = String(tourMode || 'basic');
    tourTemplateIdRef.current = String(tourTemplateId || '');
    tourStopsOverrideRef.current = Array.isArray(tourStopsOverride) ? tourStopsOverride : [];
  }, [tourMode, tourTemplateId, tourStopsOverride, tourModeRef, tourTemplateIdRef, tourStopsOverrideRef]);

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
