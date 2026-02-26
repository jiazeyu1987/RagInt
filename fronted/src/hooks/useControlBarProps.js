import { useCallback, useMemo } from 'react';

function normalizeGuideDurationInput(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (!digits) return '10';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '10';
  return String(Math.max(1, Math.min(3600, Math.round(n))));
}

export function useControlBarProps({
  useAgentMode,
  setUseAgentMode,
  agentOptions,
  selectedAgentId,
  setSelectedAgentId,
  chatOptions,
  selectedChat,
  setSelectedChat,
  guideEnabled,
  setGuideEnabled,
  guideDuration,
  setGuideDuration,
  guideStyle,
  setGuideStyle,
  qaAnswerTargetChars,
  setQaAnswerTargetChars,
  qaAudioCacheConfidenceThreshold,
  setQaAudioCacheConfidenceThreshold,
  tourMeta,
  tourZone,
  setTourZone,
  audienceProfile,
  setAudienceProfile,
  groupMode,
  setGroupMode,
  ttsEnabled,
  setTtsEnabled,
  ttsMode,
  setTtsMode,
  ttsSpeed,
  setTtsSpeed,
  continuousTour,
  setContinuousTour,
  tourRecordingEnabled,
  setTourRecordingEnabled,
  playTourRecordingEnabled,
  setPlayTourRecordingEnabled,
  tourRecordingOptions,
  selectedTourRecordingId,
  setSelectedTourRecordingId,
  renameSelectedTourRecording,
  deleteSelectedTourRecording,
  wakeWordEnabled,
  setWakeWordEnabled,
  wakeWord,
  setWakeWord,
  wakeWordCooldownMs,
  setWakeWordCooldownMs,
  wakeWordStrict,
  setWakeWordStrict,
  tourState,
  currentIntent,
  tourStops,
  tourSelectedStopIndex,
  setTourSelectedStopIndex,
  jumpTourStop,
  resetTour,
} = {}) {
  const onChangeTourRecordingEnabled = useCallback(
    (checked) => {
      const next = !!checked;
      if (typeof setTourRecordingEnabled === 'function') setTourRecordingEnabled(next);
      if (next && typeof setPlayTourRecordingEnabled === 'function') setPlayTourRecordingEnabled(false);
    },
    [setPlayTourRecordingEnabled, setTourRecordingEnabled]
  );

  const onChangePlayTourRecordingEnabled = useCallback(
    (checked) => {
      const next = !!checked;
      if (typeof setPlayTourRecordingEnabled === 'function') setPlayTourRecordingEnabled(next);
      if (next && typeof setTourRecordingEnabled === 'function') setTourRecordingEnabled(false);
    },
    [setPlayTourRecordingEnabled, setTourRecordingEnabled]
  );

  const onJumpSelectedStop = useCallback(async () => {
    try {
      await jumpTourStop(tourSelectedStopIndex);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[TOUR] jump failed', e);
    }
  }, [jumpTourStop, tourSelectedStopIndex]);

  const onChangeGuideDuration = useCallback(
    (value) => {
      if (typeof setGuideDuration !== 'function') return;
      setGuideDuration(normalizeGuideDurationInput(value));
    },
    [setGuideDuration]
  );

  return useMemo(
    () => ({
      useAgentMode,
      onChangeUseAgentMode: setUseAgentMode,
      agentOptions,
      selectedAgentId,
      onChangeSelectedAgentId: setSelectedAgentId,
      chatOptions,
      selectedChat,
      onChangeSelectedChat: setSelectedChat,
      guideEnabled,
      onChangeGuideEnabled: setGuideEnabled,
      guideDuration,
      onChangeGuideDuration,
      guideStyle,
      onChangeGuideStyle: setGuideStyle,
      qaAnswerTargetChars,
      onChangeQaAnswerTargetChars: setQaAnswerTargetChars,
      qaAudioCacheConfidenceThreshold,
      onChangeQaAudioCacheConfidenceThreshold: setQaAudioCacheConfidenceThreshold,
      tourMeta,
      tourZone,
      onChangeTourZone: setTourZone,
      audienceProfile,
      onChangeAudienceProfile: setAudienceProfile,
      groupMode,
      onChangeGroupMode: setGroupMode,
      ttsEnabled,
      onChangeTtsEnabled: setTtsEnabled,
      ttsMode,
      onChangeTtsMode: setTtsMode,
      ttsSpeed,
      onChangeTtsSpeed: setTtsSpeed,
      continuousTour,
      onChangeContinuousTour: setContinuousTour,
      tourRecordingEnabled,
      onChangeTourRecordingEnabled,
      playTourRecordingEnabled,
      onChangePlayTourRecordingEnabled,
      tourRecordingOptions,
      selectedTourRecordingId,
      onChangeSelectedTourRecordingId: setSelectedTourRecordingId,
      onRenameSelectedTourRecording: renameSelectedTourRecording,
      onDeleteSelectedTourRecording: deleteSelectedTourRecording,
      wakeWordEnabled,
      onChangeWakeWordEnabled: setWakeWordEnabled,
      wakeWord,
      onChangeWakeWord: setWakeWord,
      wakeWordCooldownMs,
      onChangeWakeWordCooldownMs: setWakeWordCooldownMs,
      wakeWordStrict,
      onChangeWakeWordStrict: setWakeWordStrict,
      tourState,
      currentIntent,
      tourStops,
      tourSelectedStopIndex,
      onChangeTourSelectedStopIndex: setTourSelectedStopIndex,
      onJump: onJumpSelectedStop,
      onReset: resetTour,
    }),
    [
      agentOptions,
      audienceProfile,
      chatOptions,
      continuousTour,
      currentIntent,
      deleteSelectedTourRecording,
      groupMode,
      guideDuration,
      guideEnabled,
      guideStyle,
      qaAnswerTargetChars,
      qaAudioCacheConfidenceThreshold,
      onJumpSelectedStop,
      onChangeGuideDuration,
      onChangePlayTourRecordingEnabled,
      onChangeTourRecordingEnabled,
      playTourRecordingEnabled,
      renameSelectedTourRecording,
      resetTour,
      selectedAgentId,
      selectedChat,
      selectedTourRecordingId,
      setAudienceProfile,
      setContinuousTour,
      setGroupMode,
      setGuideEnabled,
      setGuideStyle,
      setQaAnswerTargetChars,
      setQaAudioCacheConfidenceThreshold,
      setSelectedAgentId,
      setSelectedChat,
      setSelectedTourRecordingId,
      setTourSelectedStopIndex,
      setTourZone,
      setTtsEnabled,
      setTtsMode,
      setTtsSpeed,
      setUseAgentMode,
      setWakeWord,
      setWakeWordCooldownMs,
      setWakeWordEnabled,
      setWakeWordStrict,
      tourMeta,
      tourRecordingEnabled,
      tourRecordingOptions,
      tourSelectedStopIndex,
      tourState,
      tourStops,
      tourZone,
      ttsEnabled,
      ttsMode,
      ttsSpeed,
      useAgentMode,
      wakeWord,
      wakeWordCooldownMs,
      wakeWordEnabled,
      wakeWordStrict,
    ]
  );
}
