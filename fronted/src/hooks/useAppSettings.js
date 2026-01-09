import { useLocalStorageState } from './useLocalStorageState';

export function useAppSettings() {
  const [ttsMode, setTtsMode] = useLocalStorageState('ttsMode', 'modelscope', {
    serialize: (v) => String(v || 'modelscope'),
    deserialize: (raw) => {
      const m = String(raw || 'modelscope')
        .trim()
        .toLowerCase();
      if (m === 'online') return 'modelscope'; // backward compat
      if (m === 'local') return 'sovtts1'; // backward compat
      if (m === 'sovtts1' || m === 'sovtts2' || m === 'modelscope' || m === 'flash' || m === 'sapi' || m === 'edge') return m;
      return 'modelscope';
    },
  });

  const [modelscopeVoice, setModelscopeVoice] = useLocalStorageState('ttsModelscopeVoice', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });

  const [guideEnabled, setGuideEnabled] = useLocalStorageState('guideEnabled', true, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [continuousTour, setContinuousTour] = useLocalStorageState('continuousTour', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [tourRecordingEnabled, setTourRecordingEnabled] = useLocalStorageState('tourRecordingEnabled', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [playTourRecordingEnabled, setPlayTourRecordingEnabled] = useLocalStorageState('playTourRecordingEnabled', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [selectedTourRecordingId, setSelectedTourRecordingId] = useLocalStorageState('selectedTourRecordingId', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });

  const [guideDuration, setGuideDuration] = useLocalStorageState('guideDuration', '60', {
    serialize: (v) => String(v || '60'),
    deserialize: (raw) => String(raw || '60'),
  });

  const [guideStyle, setGuideStyle] = useLocalStorageState('guideStyle', 'friendly', {
    serialize: (v) => String(v || 'friendly'),
    deserialize: (raw) => String(raw || 'friendly'),
  });

  const [showHistoryPanel, setShowHistoryPanel] = useLocalStorageState('uiShowHistory', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [showDebugPanel, setShowDebugPanel] = useLocalStorageState('uiShowDebug', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [tourZone, setTourZone] = useLocalStorageState('tourZone', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });

  const [audienceProfile, setAudienceProfile] = useLocalStorageState('audienceProfile', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });

  const [groupMode, setGroupMode] = useLocalStorageState('groupMode', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [speakerName, setSpeakerName] = useLocalStorageState('speakerName', '观众A', {
    serialize: (v) => String(v || '观众A'),
    deserialize: (raw) => String(raw || '观众A'),
  });

  const [tourSelectedStopIndex, setTourSelectedStopIndex] = useLocalStorageState('tourSelectedStopIndex', 0, {
    serialize: (v) => String(Number.isFinite(Number(v)) ? Number(v) : 0),
    deserialize: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    },
  });

  return {
    ttsMode,
    setTtsMode,
    modelscopeVoice,
    setModelscopeVoice,
    guideEnabled,
    setGuideEnabled,
    continuousTour,
    setContinuousTour,
    tourRecordingEnabled,
    setTourRecordingEnabled,
    playTourRecordingEnabled,
    setPlayTourRecordingEnabled,
    selectedTourRecordingId,
    setSelectedTourRecordingId,
    guideDuration,
    setGuideDuration,
    guideStyle,
    setGuideStyle,
    showHistoryPanel,
    setShowHistoryPanel,
    showDebugPanel,
    setShowDebugPanel,
    tourZone,
    setTourZone,
    audienceProfile,
    setAudienceProfile,
    groupMode,
    setGroupMode,
    speakerName,
    setSpeakerName,
    tourSelectedStopIndex,
    setTourSelectedStopIndex,
  };
}

