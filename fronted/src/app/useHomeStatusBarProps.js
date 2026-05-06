import { useCallback } from 'react';
import { buildAppShellStatusModel } from './appShellStatusModel';

export function useHomeStatusBarProps({
  playTourRecordingEnabled = false,
  tourRecordingEnabled = false,
  setTourRecordingEnabled,
  setPlayTourRecordingEnabled,
  tourGuideTemplates = [],
  tourGuideTemplateId = '',
  setTourGuideTemplateId,
  tourMeta = {},
  audienceProfile = '',
  setAudienceProfile,
  tourState = null,
  tourStops = [],
  wakeWordEnabled = false,
  wakeWord = '',
  ttsSpeed,
  setTtsSpeed,
  ragflowStatusLabel,
  ragflowStatusTone,
  ragflowConversationLabel,
  debugInfo,
  serverStatus,
  ttsEnabled,
} = {}) {
  const {
    selectedGuideTemplate,
    guideTemplateOptions,
    currentModeLabel,
    currentModeValue,
    modeOptions,
    audienceProfileOptions,
    speedOptions,
    currentStopLabel,
    wakeWordLabel,
    audienceProfileLabel,
  } = buildAppShellStatusModel({
    playTourRecordingEnabled,
    tourRecordingEnabled,
    tourGuideTemplates,
    tourGuideTemplateId,
    tourMeta,
    audienceProfile,
    tourState,
    tourStops,
    wakeWordEnabled,
    wakeWord,
  });

  const onChangeMode = useCallback(
    (value) => {
      const nextMode = String(value || '').trim();
      if (nextMode === 'playback') {
        setTourRecordingEnabled(false);
        setPlayTourRecordingEnabled(true);
        return;
      }
      if (nextMode === 'recording') {
        setPlayTourRecordingEnabled(false);
        setTourRecordingEnabled(true);
        return;
      }
      setPlayTourRecordingEnabled(false);
      setTourRecordingEnabled(false);
    },
    [setPlayTourRecordingEnabled, setTourRecordingEnabled]
  );

  const onChangeSpeed = useCallback(
    (value) => {
      setTtsSpeed(Number(value) || 1.0);
    },
    [setTtsSpeed]
  );

  const onChangeTemplate = useCallback(
    (value) => {
      setTourGuideTemplateId(String(value || '').trim());
    },
    [setTourGuideTemplateId]
  );

  const onChangeAudienceProfile = useCallback(
    (value) => {
      setAudienceProfile(String(value || '').trim());
    },
    [setAudienceProfile]
  );

  return {
    modeValue: currentModeValue,
    currentModeLabel,
    modeOptions,
    onChangeMode,
    speedValue: String(ttsSpeed || 1),
    speedOptions,
    onChangeSpeed,
    templateValue: selectedGuideTemplate ? String(selectedGuideTemplate.id || '') : '',
    templateOptions: guideTemplateOptions,
    onChangeTemplate,
    audienceProfileValue: audienceProfileLabel,
    audienceProfileOptions,
    onChangeAudienceProfile,
    ragflowStatusLabel,
    ragflowStatusTone,
    ragflowConversationLabel,
    wakeWordLabel,
    currentStopLabel,
    debugInfo,
    serverStatus: serverStatus && typeof serverStatus === 'object' ? serverStatus : null,
    ttsEnabled,
  };
}
