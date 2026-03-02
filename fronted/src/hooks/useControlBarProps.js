import { useCallback, useMemo } from 'react';

const STOP_DURATION_TEMPLATE_KEYS = ['tpl_1m', 'tpl_2m', 'tpl_3m', 'tpl_4m', 'tpl_5m'];
const STOP_DURATION_TEMPLATE_BASE_SECONDS = {
  tpl_1m: 60,
  tpl_2m: 120,
  tpl_3m: 180,
  tpl_4m: 240,
  tpl_5m: 300,
};

function normalizeGuideDurationInput(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (!digits) return '10';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '10';
  return String(Math.max(1, Math.min(3600, Math.round(n))));
}

function normalizeStopDurationInput(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  return String(Math.max(1, Math.min(3600, Math.round(n))));
}

function normalizeStopPromptOverrideMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((key) => {
    const stopName = String(key || '').trim();
    if (!stopName) return;
    const text = String(value[key] == null ? '' : value[key]).trim();
    if (!text) return;
    out[stopName] = text;
  });
  return out;
}

function normalizeTemplateKey(value) {
  const key = String(value || '').trim();
  if (STOP_DURATION_TEMPLATE_KEYS.includes(key)) return key;
  return STOP_DURATION_TEMPLATE_KEYS[0];
}

function getTemplateBaseSeconds(templateKey) {
  const key = normalizeTemplateKey(templateKey);
  return Number(STOP_DURATION_TEMPLATE_BASE_SECONDS[key]) || 60;
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
  qaAudioCacheLookupEnabled,
  setQaAudioCacheLookupEnabled,
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
  tourStopsOverride,
  tourStopDurations,
  tourStopDurationsOverride,
  setTourStopDurationsOverride,
  tourStopPromptOverrides,
  setTourStopPromptOverrides,
  tourStopDurationTemplateKey,
  setTourStopDurationTemplateKey,
  tourStopDurationTemplates,
  setTourStopDurationTemplates,
  tourSelectedStopIndex,
  setTourSelectedStopIndex,
  jumpTourStop,
  resetTour,
  globalPromptPrefix,
  setGlobalPromptPrefix,
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

  const onChangeTourStopDurationOverride = useCallback(
    (stopName, value) => {
      if (typeof setTourStopDurationsOverride !== 'function') return;
      const key = String(stopName || '').trim();
      if (!key) return;
      const nextValue = normalizeStopDurationInput(value);
      const prevMap =
        tourStopDurationsOverride && typeof tourStopDurationsOverride === 'object' && !Array.isArray(tourStopDurationsOverride)
          ? tourStopDurationsOverride
          : {};
      const nextMap = { ...prevMap };
      if (!nextValue) delete nextMap[key];
      else nextMap[key] = Number(nextValue);
      setTourStopDurationsOverride(nextMap);
    },
    [setTourStopDurationsOverride, tourStopDurationsOverride]
  );

  const onClearTourStopDurationsOverride = useCallback(() => {
    if (typeof setTourStopDurationsOverride !== 'function') return;
    setTourStopDurationsOverride({});
  }, [setTourStopDurationsOverride]);

  const onFillTourStopDurationsOverrideFromPlan = useCallback(() => {
    if (typeof setTourStopDurationsOverride !== 'function') return;
    const stops = Array.isArray(tourStops) ? tourStops : [];
    const durs = Array.isArray(tourStopDurations) ? tourStopDurations : [];
    const next = {};
    for (let i = 0; i < stops.length; i += 1) {
      const name = String(stops[i] || '').trim();
      const n = Number(durs[i]);
      if (!name || !Number.isFinite(n) || n <= 0) continue;
      next[name] = Math.max(1, Math.min(3600, Math.round(n)));
    }
    setTourStopDurationsOverride(next);
  }, [setTourStopDurationsOverride, tourStopDurations, tourStops]);

  const onChangeTourStopPromptOverride = useCallback(
    (stopName, value) => {
      if (typeof setTourStopPromptOverrides !== 'function') return;
      const key = String(stopName || '').trim();
      if (!key) return;
      const text = String(value == null ? '' : value);
      const prevMap = normalizeStopPromptOverrideMap(tourStopPromptOverrides);
      const nextMap = { ...prevMap };
      if (!String(text).trim()) delete nextMap[key];
      else nextMap[key] = text;
      setTourStopPromptOverrides(nextMap);
    },
    [setTourStopPromptOverrides, tourStopPromptOverrides]
  );

  const onSaveTourStopPromptOverrides = useCallback(
    (nextMap) => {
      if (typeof setTourStopPromptOverrides !== 'function') return;
      setTourStopPromptOverrides(normalizeStopPromptOverrideMap(nextMap));
    },
    [setTourStopPromptOverrides]
  );

  const onClearTourStopPromptOverrides = useCallback(() => {
    onSaveTourStopPromptOverrides({});
  }, [onSaveTourStopPromptOverrides]);

  const normalizedTemplateKey = normalizeTemplateKey(tourStopDurationTemplateKey);

  const normalizedTemplates = useMemo(() => {
    const src = tourStopDurationTemplates && typeof tourStopDurationTemplates === 'object' && !Array.isArray(tourStopDurationTemplates)
      ? tourStopDurationTemplates
      : {};
    const out = {};
    for (const key of STOP_DURATION_TEMPLATE_KEYS) {
      const baseSeconds = getTemplateBaseSeconds(key);
      const raw = src[key] && typeof src[key] === 'object' && !Array.isArray(src[key]) ? src[key] : {};
      const values =
        raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values) ? raw.values : {};
      out[key] = {
        key,
        name: String(raw.name || `${Math.round(baseSeconds / 60)}分钟模板`).trim() || `${Math.round(baseSeconds / 60)}分钟模板`,
        baseSeconds,
        values,
      };
    }
    return out;
  }, [tourStopDurationTemplates]);

  const templateOptions = useMemo(
    () =>
      STOP_DURATION_TEMPLATE_KEYS.map((key) => {
        const tpl = normalizedTemplates[key];
        return { key, label: tpl && tpl.name ? tpl.name : `${Math.round(getTemplateBaseSeconds(key) / 60)}分钟模板` };
      }),
    [normalizedTemplates]
  );

  const buildOverrideFromTemplate = useCallback(
    (templateKey) => {
      const key = normalizeTemplateKey(templateKey);
      const tpl = normalizedTemplates[key];
      const baseSeconds = tpl && Number.isFinite(Number(tpl.baseSeconds)) ? Number(tpl.baseSeconds) : getTemplateBaseSeconds(key);
      const values = tpl && tpl.values && typeof tpl.values === 'object' && !Array.isArray(tpl.values) ? tpl.values : {};
      const stops = Array.isArray(tourStops) ? tourStops : [];
      const next = {};
      for (const s of stops) {
        const name = String(s || '').trim();
        if (!name) continue;
        const fromTemplate = Number(values[name]);
        const v = Number.isFinite(fromTemplate) && fromTemplate > 0 ? fromTemplate : baseSeconds;
        next[name] = Math.max(1, Math.min(3600, Math.round(v)));
      }
      return next;
    },
    [normalizedTemplates, tourStops]
  );

  const onChangeTourStopDurationTemplate = useCallback(
    (value) => {
      const key = normalizeTemplateKey(value);
      if (typeof setTourStopDurationTemplateKey === 'function') {
        setTourStopDurationTemplateKey(key);
      }
      if (typeof setTourStopDurationsOverride === 'function') {
        setTourStopDurationsOverride(buildOverrideFromTemplate(key));
      }
    },
    [buildOverrideFromTemplate, setTourStopDurationTemplateKey, setTourStopDurationsOverride]
  );

  const onSaveTourStopDurationsToTemplate = useCallback(() => {
    if (typeof setTourStopDurationTemplates !== 'function') return;
    const key = normalizeTemplateKey(tourStopDurationTemplateKey);
    const currentOverride =
      tourStopDurationsOverride && typeof tourStopDurationsOverride === 'object' && !Array.isArray(tourStopDurationsOverride)
        ? tourStopDurationsOverride
        : {};
    const stops = Array.isArray(tourStops) ? tourStops : [];
    const values = {};
    for (const s of stops) {
      const name = String(s || '').trim();
      const n = Number(currentOverride[name]);
      if (!name || !Number.isFinite(n) || n <= 0) continue;
      values[name] = Math.max(1, Math.min(3600, Math.round(n)));
    }
    setTourStopDurationTemplates((prev) => {
      const src = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
      const cur = src[key] && typeof src[key] === 'object' && !Array.isArray(src[key]) ? src[key] : {};
      return {
        ...src,
        [key]: {
          ...cur,
          values,
        },
      };
    });
  }, [setTourStopDurationTemplates, tourStopDurationTemplateKey, tourStopDurationsOverride, tourStops]);

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
      qaAudioCacheLookupEnabled,
      onChangeQaAudioCacheLookupEnabled: setQaAudioCacheLookupEnabled,
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
      tourStopsOverride: Array.isArray(tourStopsOverride) ? tourStopsOverride : [],
      tourStopDurations,
      tourStopDurationsOverride:
        tourStopDurationsOverride && typeof tourStopDurationsOverride === 'object' && !Array.isArray(tourStopDurationsOverride)
          ? tourStopDurationsOverride
          : {},
      tourStopPromptOverrides:
        tourStopPromptOverrides && typeof tourStopPromptOverrides === 'object' && !Array.isArray(tourStopPromptOverrides)
          ? tourStopPromptOverrides
          : {},
      tourStopDurationTemplateKey: normalizedTemplateKey,
      tourStopDurationTemplateOptions: templateOptions,
      onChangeTourStopDurationOverride,
      onClearTourStopDurationsOverride,
      onFillTourStopDurationsOverrideFromPlan,
      onChangeTourStopDurationTemplate,
      onSaveTourStopDurationsToTemplate,
      onChangeTourStopPromptOverride,
      onSaveTourStopPromptOverrides,
      onClearTourStopPromptOverrides,
      tourSelectedStopIndex,
      onChangeTourSelectedStopIndex: setTourSelectedStopIndex,
      onJump: onJumpSelectedStop,
      onReset: resetTour,
      globalPromptPrefix,
      onChangeGlobalPromptPrefix: setGlobalPromptPrefix,
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
      qaAudioCacheLookupEnabled,
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
      setQaAudioCacheLookupEnabled,
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
      tourStopsOverride,
      tourStopDurations,
      tourStopDurationsOverride,
      tourStopPromptOverrides,
      normalizedTemplateKey,
      templateOptions,
      tourZone,
      ttsEnabled,
      ttsMode,
      ttsSpeed,
      useAgentMode,
      wakeWord,
      wakeWordCooldownMs,
      wakeWordEnabled,
      wakeWordStrict,
      onChangeTourStopDurationOverride,
      onClearTourStopDurationsOverride,
      onFillTourStopDurationsOverrideFromPlan,
      onChangeTourStopDurationTemplate,
      onSaveTourStopDurationsToTemplate,
      onChangeTourStopPromptOverride,
      onSaveTourStopPromptOverrides,
      onClearTourStopPromptOverrides,
      globalPromptPrefix,
      setGlobalPromptPrefix,
    ]
  );
}
