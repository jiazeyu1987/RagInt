import { useEffect } from 'react';
import { useLocalStorageState } from './useLocalStorageState';
import { TourTemplateManager } from '../managers/TourTemplateManager';
import {
  DEFAULT_ASR_FILTER_CHAT_NAME,
  DEFAULT_ASR_FILTER_PROMPT,
  DEFAULT_ASR_FILTER_TERMS,
} from '../config/asrFilter';

const ALLOWED_TTS_FETCH_CONCURRENCY = new Set([2, 4, 6, 8, 10]);
const FLASH_VOICE_OPTIONS = new Set(['longanyang', 'longanhuan']);
const STOP_DURATION_TEMPLATE_KEYS = ['tpl_1m', 'tpl_2m', 'tpl_3m', 'tpl_4m', 'tpl_5m'];
const STOP_DURATION_TEMPLATE_BASE_SECONDS = {
  tpl_1m: 60,
  tpl_2m: 120,
  tpl_3m: 180,
  tpl_4m: 240,
  tpl_5m: 300,
};

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

function normalizeTourStopDurationsOverride(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const key = String(k || '').trim();
    if (!key) continue;
    const digits = String(v == null ? '' : v).replace(/[^\d]/g, '');
    if (!digits) continue;
    const n = Number(digits);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.max(1, Math.min(3600, Math.round(n)));
  }
  return out;
}

function normalizeTourStopPromptOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const key = String(k || '').trim();
    if (!key) continue;
    const text = String(v == null ? '' : v).trim();
    if (!text) continue;
    out[key] = text;
  }
  return out;
}

function normalizeTourGuideTemplates(value) {
  return TourTemplateManager.normalizeTemplates(Array.isArray(value) ? value : []);
}

function normalizeTourStopDurationTemplateKey(value) {
  const key = String(value || '').trim();
  if (STOP_DURATION_TEMPLATE_KEYS.includes(key)) return key;
  return STOP_DURATION_TEMPLATE_KEYS[0];
}

function buildDefaultTourStopDurationTemplates() {
  const out = {};
  for (const key of STOP_DURATION_TEMPLATE_KEYS) {
    const baseSeconds = Number(STOP_DURATION_TEMPLATE_BASE_SECONDS[key]) || 60;
    out[key] = {
      name: `${Math.round(baseSeconds / 60)}分钟模板`,
      base_seconds: baseSeconds,
      values: {},
    };
  }
  return out;
}

function normalizeTourStopDurationTemplates(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const key of STOP_DURATION_TEMPLATE_KEYS) {
    const raw = src[key] && typeof src[key] === 'object' && !Array.isArray(src[key]) ? src[key] : {};
    const baseSeconds = Number(STOP_DURATION_TEMPLATE_BASE_SECONDS[key]) || 60;
    const name = String(raw.name || `${Math.round(baseSeconds / 60)}分钟模板`).trim() || `${Math.round(baseSeconds / 60)}分钟模板`;
    out[key] = {
      name,
      base_seconds: baseSeconds,
      values: normalizeTourStopDurationsOverride(raw.values),
    };
  }
  return out;
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

  useEffect(() => {
    const mode = String(ttsMode || '').trim().toLowerCase();
    const voice = String(modelscopeVoice || '').trim();
    if (mode === 'flash') {
      if (!FLASH_VOICE_OPTIONS.has(voice)) setModelscopeVoice('longanyang');
    }
  }, [ttsMode, modelscopeVoice, setModelscopeVoice]);

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

  const [qaAudioCacheLookupEnabled, setQaAudioCacheLookupEnabled] = useLocalStorageState(
    'qaAudioCacheLookupEnabled',
    true,
    {
      serialize: (v) => (v ? '1' : '0'),
      deserialize: (raw) => String(raw) !== '0',
    }
  );

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

  const [tourStopDurationsOverride, setTourStopDurationsOverrideState] = useLocalStorageState(
    'tourStopDurationsOverride',
    {},
    {
      serialize: (v) => JSON.stringify(normalizeTourStopDurationsOverride(v)),
      deserialize: (raw) => {
        try {
          return normalizeTourStopDurationsOverride(JSON.parse(raw));
        } catch (_) {
          return {};
        }
      },
    }
  );
  const setTourStopDurationsOverride = (value) =>
    setTourStopDurationsOverrideState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return normalizeTourStopDurationsOverride(next);
    });

  const [tourStopPromptOverrides, setTourStopPromptOverridesState] = useLocalStorageState(
    'tourStopPromptOverrides',
    {},
    {
      serialize: (v) => JSON.stringify(normalizeTourStopPromptOverrides(v)),
      deserialize: (raw) => {
        try {
          return normalizeTourStopPromptOverrides(JSON.parse(raw));
        } catch (_) {
          return {};
        }
      },
    }
  );
  const setTourStopPromptOverrides = (value) =>
    setTourStopPromptOverridesState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return normalizeTourStopPromptOverrides(next);
    });

  const [tourGuideTemplates, setTourGuideTemplatesState] = useLocalStorageState('tourGuideTemplates', [], {
    serialize: (v) => JSON.stringify(normalizeTourGuideTemplates(v)),
    deserialize: (raw) => {
      try {
        return normalizeTourGuideTemplates(JSON.parse(raw));
      } catch (_) {
        return [];
      }
    },
  });
  const setTourGuideTemplates = (value) =>
    setTourGuideTemplatesState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return normalizeTourGuideTemplates(next);
    });

  const [tourGuideTemplateId, setTourGuideTemplateId] = useLocalStorageState('tourGuideTemplateId', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });

  const [tourStopDurationTemplateKey, setTourStopDurationTemplateKeyState] = useLocalStorageState(
    'tourStopDurationTemplateKey',
    STOP_DURATION_TEMPLATE_KEYS[0],
    {
      serialize: (v) => normalizeTourStopDurationTemplateKey(v),
      deserialize: (raw) => normalizeTourStopDurationTemplateKey(raw),
    }
  );
  const setTourStopDurationTemplateKey = (value) =>
    setTourStopDurationTemplateKeyState(normalizeTourStopDurationTemplateKey(value));

  const [tourStopDurationTemplates, setTourStopDurationTemplatesState] = useLocalStorageState(
    'tourStopDurationTemplates',
    buildDefaultTourStopDurationTemplates(),
    {
      serialize: (v) => JSON.stringify(normalizeTourStopDurationTemplates(v)),
      deserialize: (raw) => {
        try {
          return normalizeTourStopDurationTemplates(JSON.parse(raw));
        } catch (_) {
          return buildDefaultTourStopDurationTemplates();
        }
      },
    }
  );
  const setTourStopDurationTemplates = (value) =>
    setTourStopDurationTemplatesState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return normalizeTourStopDurationTemplates(next);
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

  const [globalPromptPrefix, setGlobalPromptPrefix] = useLocalStorageState('globalPromptPrefix', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });

  const [asrTextFilterEnabled, setAsrTextFilterEnabled] = useLocalStorageState('asrTextFilterEnabled', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) !== '0',
  });

  const [asrTextFilterChatName, setAsrTextFilterChatName] = useLocalStorageState(
    'asrTextFilterChatName',
    DEFAULT_ASR_FILTER_CHAT_NAME,
    {
      serialize: (v) => String(v || DEFAULT_ASR_FILTER_CHAT_NAME),
      deserialize: (raw) => String(raw || DEFAULT_ASR_FILTER_CHAT_NAME),
    }
  );

  const [asrTextFilterTerms, setAsrTextFilterTerms] = useLocalStorageState('asrTextFilterTerms', DEFAULT_ASR_FILTER_TERMS, {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || DEFAULT_ASR_FILTER_TERMS),
  });

  const [asrTextFilterPrompt, setAsrTextFilterPrompt] = useLocalStorageState(
    'asrTextFilterPrompt',
    DEFAULT_ASR_FILTER_PROMPT,
    {
      serialize: (v) => String(v || ''),
      deserialize: (raw) => String(raw || DEFAULT_ASR_FILTER_PROMPT),
    }
  );

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
    qaAudioCacheLookupEnabled,
    setQaAudioCacheLookupEnabled,
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
    tourTemplateId,
    setTourTemplateId,
    tourStopsOverride,
    setTourStopsOverride,
    tourStopDurationsOverride,
    setTourStopDurationsOverride,
    tourStopPromptOverrides,
    setTourStopPromptOverrides,
    tourGuideTemplates,
    setTourGuideTemplates,
    tourGuideTemplateId,
    setTourGuideTemplateId,
    tourStopDurationTemplateKey,
    setTourStopDurationTemplateKey,
    tourStopDurationTemplates,
    setTourStopDurationTemplates,
    wakeWordEnabled,
    setWakeWordEnabled,
    wakeWord,
    setWakeWord,
    wakeWordCooldownMs,
    setWakeWordCooldownMs,
    wakeWordStrict,
    setWakeWordStrict,
    globalPromptPrefix,
    setGlobalPromptPrefix,
    asrTextFilterEnabled,
    setAsrTextFilterEnabled,
    asrTextFilterChatName,
    setAsrTextFilterChatName,
    asrTextFilterTerms,
    setAsrTextFilterTerms,
    asrTextFilterPrompt,
    setAsrTextFilterPrompt,
  };
}
