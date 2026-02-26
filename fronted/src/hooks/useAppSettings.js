import { useLocalStorageState } from './useLocalStorageState';

const ALLOWED_TTS_FETCH_CONCURRENCY = new Set([2, 4, 6, 8, 10]);

function normalizeTtsFetchConcurrency(value) {
  const n = Number(value);
  if (ALLOWED_TTS_FETCH_CONCURRENCY.has(n)) return n;
  return 4;
}

function normalizeGuideDuration(value) {
  const digits = String(value == null ? '' : value).replace(/[^\d]/g, '');
  if (!digits) return '10';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '10';
  return String(Math.max(1, Math.min(3600, Math.round(n))));
}

function normalizeQaAnswerTargetChars(value) {
  const digits = String(value == null ? '' : value).replace(/[^\d]/g, '');
  if (!digits) return '1';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '1';
  return String(Math.max(1, Math.min(5000, Math.round(n))));
}

function normalizeQaAudioCacheConfidenceThreshold(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '0.85';
  const n = Number(s);
  if (!Number.isFinite(n)) return '0.85';
  return String(Math.max(0, Math.min(1, n)));
}

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

  const [ttsSpeed, setTtsSpeed] = useLocalStorageState('ttsSpeed', 1.0, {
    serialize: (v) => String(Number.isFinite(Number(v)) ? Number(v) : 1.0),
    deserialize: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 1.0;
    },
  });

  const [ttsFetchConcurrency, setTtsFetchConcurrency] = useLocalStorageState('ttsFetchConcurrency', 4, {
    serialize: (v) => String(normalizeTtsFetchConcurrency(v)),
    deserialize: (raw) => normalizeTtsFetchConcurrency(raw),
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

  const [guideDuration, setGuideDurationState] = useLocalStorageState('guideDuration', '10', {
    serialize: (v) => normalizeGuideDuration(v),
    deserialize: (raw) => normalizeGuideDuration(raw),
  });
  const setGuideDuration = (value) => setGuideDurationState(normalizeGuideDuration(value));

  const [guideStyle, setGuideStyle] = useLocalStorageState('guideStyle', 'friendly', {
    serialize: (v) => String(v || 'friendly'),
    deserialize: (raw) => String(raw || 'friendly'),
  });

  const [qaAnswerTargetChars, setQaAnswerTargetCharsState] = useLocalStorageState('qaAnswerTargetChars', '10', {
    serialize: (v) => normalizeQaAnswerTargetChars(v),
    deserialize: (raw) => normalizeQaAnswerTargetChars(raw),
  });
  const setQaAnswerTargetChars = (value) => setQaAnswerTargetCharsState(normalizeQaAnswerTargetChars(value));

  const [qaAudioCacheConfidenceThreshold, setQaAudioCacheConfidenceThresholdState] = useLocalStorageState(
    'qaAudioCacheConfidenceThreshold',
    '0.85',
    {
      serialize: (v) => normalizeQaAudioCacheConfidenceThreshold(v),
      deserialize: (raw) => normalizeQaAudioCacheConfidenceThreshold(raw),
    }
  );
  const setQaAudioCacheConfidenceThreshold = (value) =>
    setQaAudioCacheConfidenceThresholdState(normalizeQaAudioCacheConfidenceThreshold(value));

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

  const [tourMode, setTourMode] = useLocalStorageState('tourMode', 'basic', {
    serialize: (v) => String(v || 'basic'),
    deserialize: (raw) => {
      const m = String(raw || 'basic').trim().toLowerCase();
      if (m === 'personalized' || m === 'basic') return m;
      return 'basic';
    },
  });

  const [tourTemplateId, setTourTemplateId] = useLocalStorageState('tourTemplateId', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });

  const [tourStopsOverride, setTourStopsOverride] = useLocalStorageState('tourStopsOverride', [], {
    serialize: (v) => JSON.stringify(Array.isArray(v) ? v : []),
    deserialize: (raw) => {
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.map((x) => String(x || '').trim()).filter(Boolean) : [];
      } catch (_) {
        return [];
      }
    },
  });

  const [wakeWordEnabled, setWakeWordEnabled] = useLocalStorageState('wakeWordEnabled', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  const [wakeWord, setWakeWord] = useLocalStorageState('wakeWord', '你好小R', {
    serialize: (v) => String(v || '你好小R'),
    deserialize: (raw) => String(raw || '你好小R'),
  });

  const [wakeWordCooldownMs, setWakeWordCooldownMs] = useLocalStorageState('wakeWordCooldownMs', 5000, {
    serialize: (v) => String(Number.isFinite(Number(v)) ? Number(v) : 5000),
    deserialize: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 5000;
    },
  });

  // Default to non-strict to better match real ASR behavior (often includes leading filler like "嗯/啊").
  const [wakeWordStrict, setWakeWordStrict] = useLocalStorageState('wakeWordStrict', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });

  return {
    ttsMode,
    setTtsMode,
    modelscopeVoice,
    setModelscopeVoice,
    ttsSpeed,
    setTtsSpeed,
    ttsFetchConcurrency,
    setTtsFetchConcurrency,
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
    qaAnswerTargetChars,
    setQaAnswerTargetChars,
    qaAudioCacheConfidenceThreshold,
    setQaAudioCacheConfidenceThreshold,
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
    tourMode,
    setTourMode,
    tourTemplateId,
    setTourTemplateId,
    tourStopsOverride,
    setTourStopsOverride,
    wakeWordEnabled,
    setWakeWordEnabled,
    wakeWord,
    setWakeWord,
    wakeWordCooldownMs,
    setWakeWordCooldownMs,
    wakeWordStrict,
    setWakeWordStrict,
  };
}
