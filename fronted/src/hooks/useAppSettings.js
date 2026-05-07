import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAppSettings, saveAppSettings } from '../api/backendClient';
import {
  assertValidPersistedSettings,
  buildDefaultSettings,
  buildDefaultTourStopDurationTemplates,
  buildSettingsError,
  normalizeAppSettings,
} from './appSettingsModel';

function readLegacySettingsFromLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  const read = (key) => {
    return window.localStorage.getItem(key);
  };
  const readJson = (key, fallback) => {
    const raw = read(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  };

  const out = {};
  const assign = (field, key, transform = (value) => value) => {
    const raw = read(key);
    if (raw == null) return;
    out[field] = transform(raw);
  };

  assign('ttsMode', 'ttsMode');
  assign('modelscopeVoice', 'ttsModelscopeVoice');
  assign('ttsSpeed', 'ttsSpeed', Number);
  assign('ttsFetchConcurrency', 'ttsFetchConcurrency', Number);
  assign('guideEnabled', 'guideEnabled');
  assign('continuousTour', 'continuousTour');
  assign('tourRecordingEnabled', 'tourRecordingEnabled');
  assign('playTourRecordingEnabled', 'playTourRecordingEnabled');
  assign('selectedTourRecordingId', 'selectedTourRecordingId');
  assign('guideDuration', 'guideDuration');
  assign('guideStyle', 'guideStyle');
  assign('qaAnswerTargetChars', 'qaAnswerTargetChars');
  assign('qaAudioCacheConfidenceThreshold', 'qaAudioCacheConfidenceThreshold');
  assign('qaAudioCacheLookupEnabled', 'qaAudioCacheLookupEnabled');
  assign('showHistoryPanel', 'uiShowHistory');
  assign('showDebugPanel', 'uiShowDebug');
  assign('tourZone', 'tourZone');
  assign('audienceProfile', 'audienceProfile');
  assign('groupMode', 'groupMode');
  assign('speakerName', 'speakerName');
  assign('tourSelectedStopIndex', 'tourSelectedStopIndex', Number);
  assign('tourTemplateId', 'tourTemplateId');
  assign('tourGuideTemplateId', 'tourGuideTemplateId');
  assign('tourStopDurationTemplateKey', 'tourStopDurationTemplateKey');
  assign('wakeWordEnabled', 'wakeWordEnabled');
  assign('wakeWord', 'wakeWord');
  assign('wakeWordCooldownMs', 'wakeWordCooldownMs', Number);
  assign('wakeWordStrict', 'wakeWordStrict');
  assign('asrAutoResumeAfterAnswerEnabled', 'asrAutoResumeAfterAnswerEnabled');
  assign('asrAutoResumeAfterAnswerDelayMs', 'asrAutoResumeAfterAnswerDelayMs', Number);
  assign('asrConversationAutoSubmitSilenceMs', 'asrConversationAutoSubmitSilenceMs', Number);
  assign('asrConversationContextStrategy', 'asrConversationContextStrategy');
  assign('asrConversationContextRecentTurns', 'asrConversationContextRecentTurns', Number);
  assign('asrConversationContextMaxTokens', 'asrConversationContextMaxTokens', Number);
  assign('globalPromptPrefix', 'globalPromptPrefix');
  assign('asrTextFilterEnabled', 'asrTextFilterEnabled');
  assign('asrTextFilterChatName', 'asrTextFilterChatName');
  assign('asrTextFilterTerms', 'asrTextFilterTerms');
  assign('asrTextFilterPrompt', 'asrTextFilterPrompt');
  assign('settingsActiveTab', 'settingsActiveTab');
  assign('asrProviderType', 'asrProviderType');
  assign('asrFinalTimeoutStrategy', 'asrFinalTimeoutStrategy');
  assign('saucWsUrl', 'saucWsUrl');
  assign('saucResourceId', 'saucResourceId');
  assign('saucAppKey', 'saucAppKey');
  assign('saucAccessKey', 'saucAccessKey');
  assign('saucModelName', 'saucModelName');
  assign('saucSegmentDurationMs', 'saucSegmentDurationMs', Number);
  assign('saucEnableItn', 'saucEnableItn');
  assign('saucEnablePunc', 'saucEnablePunc');
  assign('saucEnableDdc', 'saucEnableDdc');
  assign('saucShowUtterances', 'saucShowUtterances');
  assign('saucEnableNonstream', 'saucEnableNonstream');

  out.tourStopsOverride = readJson('tourStopsOverride', []);
  out.tourStopDurationsOverride = readJson('tourStopDurationsOverride', {});
  out.tourStopPromptOverrides = readJson('tourStopPromptOverrides', {});
  out.tourGuideTemplates = readJson('tourGuideTemplates', []);
  out.tourStopDurationTemplates = readJson('tourStopDurationTemplates', buildDefaultTourStopDurationTemplates());
  return out;
}

export function useAppSettings(clientId) {
  const [settings, setSettings] = useState(() => buildDefaultSettings());
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const lastSavedJsonRef = useRef('');
  const skipNextSaveRef = useRef(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setSettingsReady(false);
    setSettingsError(null);
    skipNextSaveRef.current = false;

    (async () => {
      try {
        const res = await fetchAppSettings({ clientId });
        const serverSettings = (res && res.settings) || {};
        const hasServerSettings = !!(serverSettings && typeof serverSettings === 'object' && Object.keys(serverSettings).length);
        const persistedSettings = hasServerSettings ? serverSettings : readLegacySettingsFromLocalStorage();
        assertValidPersistedSettings(persistedSettings);
        const next = normalizeAppSettings(persistedSettings);
        if (cancelled) return;
        lastSavedJsonRef.current = hasServerSettings ? JSON.stringify(next) : '';
        skipNextSaveRef.current = false;
        setSettings(next);
        setSettingsError(null);
      } catch (err) {
        if (cancelled) return;
        setSettings((prev) => normalizeAppSettings(prev));
        lastSavedJsonRef.current = '';
        skipNextSaveRef.current = true;
        setSettingsError(buildSettingsError('load', err));
      } finally {
        if (!cancelled) setSettingsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const serialized = JSON.stringify(settings);
    if (skipNextSaveRef.current) {
      lastSavedJsonRef.current = serialized;
      skipNextSaveRef.current = false;
      return;
    }
    if (serialized === lastSavedJsonRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await saveAppSettings({ clientId, settings });
        lastSavedJsonRef.current = serialized;
      } catch (err) {
        setSettingsError(buildSettingsError('save', err));
      } finally {
        saveTimerRef.current = null;
      }
    }, 300);

    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [clientId, settings, settingsReady]);

  const updateSetting = useCallback((key, valueOrUpdater) => {
    setSettings((prev) => {
      const base = normalizeAppSettings(prev);
      const nextValue = typeof valueOrUpdater === 'function' ? valueOrUpdater(base[key]) : valueOrUpdater;
      return normalizeAppSettings({ ...base, [key]: nextValue });
    });
  }, []);

  const setTtsMode = useCallback((value) => updateSetting('ttsMode', value), [updateSetting]);
  const setModelscopeVoice = useCallback((value) => updateSetting('modelscopeVoice', value), [updateSetting]);
  const setTtsSpeed = useCallback((value) => updateSetting('ttsSpeed', value), [updateSetting]);
  const setTtsFetchConcurrency = useCallback((value) => updateSetting('ttsFetchConcurrency', value), [updateSetting]);
  const setGuideEnabled = useCallback((value) => updateSetting('guideEnabled', value), [updateSetting]);
  const setContinuousTour = useCallback((value) => updateSetting('continuousTour', value), [updateSetting]);
  const setTourRecordingEnabled = useCallback((value) => updateSetting('tourRecordingEnabled', value), [updateSetting]);
  const setPlayTourRecordingEnabled = useCallback((value) => updateSetting('playTourRecordingEnabled', value), [updateSetting]);
  const setSelectedTourRecordingId = useCallback((value) => updateSetting('selectedTourRecordingId', value), [updateSetting]);
  const setGuideDuration = useCallback((value) => updateSetting('guideDuration', value), [updateSetting]);
  const setGuideStyle = useCallback((value) => updateSetting('guideStyle', value), [updateSetting]);
  const setQaAnswerTargetChars = useCallback((value) => updateSetting('qaAnswerTargetChars', value), [updateSetting]);
  const setQaAudioCacheConfidenceThreshold = useCallback(
    (value) => updateSetting('qaAudioCacheConfidenceThreshold', value),
    [updateSetting]
  );
  const setQaAudioCacheLookupEnabled = useCallback((value) => updateSetting('qaAudioCacheLookupEnabled', value), [updateSetting]);
  const setShowHistoryPanel = useCallback((value) => updateSetting('showHistoryPanel', value), [updateSetting]);
  const setShowDebugPanel = useCallback((value) => updateSetting('showDebugPanel', value), [updateSetting]);
  const setTourZone = useCallback((value) => updateSetting('tourZone', value), [updateSetting]);
  const setAudienceProfile = useCallback((value) => updateSetting('audienceProfile', value), [updateSetting]);
  const setGroupMode = useCallback((value) => updateSetting('groupMode', value), [updateSetting]);
  const setSpeakerName = useCallback((value) => updateSetting('speakerName', value), [updateSetting]);
  const setTourSelectedStopIndex = useCallback((value) => updateSetting('tourSelectedStopIndex', value), [updateSetting]);
  const setTourTemplateId = useCallback((value) => updateSetting('tourTemplateId', value), [updateSetting]);
  const setTourStopsOverride = useCallback((value) => updateSetting('tourStopsOverride', value), [updateSetting]);
  const setTourStopDurationsOverride = useCallback((value) => updateSetting('tourStopDurationsOverride', value), [updateSetting]);
  const setTourStopPromptOverrides = useCallback((value) => updateSetting('tourStopPromptOverrides', value), [updateSetting]);
  const setTourGuideTemplates = useCallback((value) => updateSetting('tourGuideTemplates', value), [updateSetting]);
  const setTourGuideTemplateId = useCallback((value) => updateSetting('tourGuideTemplateId', value), [updateSetting]);
  const setTourStopDurationTemplateKey = useCallback((value) => updateSetting('tourStopDurationTemplateKey', value), [updateSetting]);
  const setTourStopDurationTemplates = useCallback((value) => updateSetting('tourStopDurationTemplates', value), [updateSetting]);
  const setWakeWordEnabled = useCallback((value) => updateSetting('wakeWordEnabled', value), [updateSetting]);
  const setWakeWord = useCallback((value) => updateSetting('wakeWord', value), [updateSetting]);
  const setWakeWordCooldownMs = useCallback((value) => updateSetting('wakeWordCooldownMs', value), [updateSetting]);
  const setWakeWordStrict = useCallback((value) => updateSetting('wakeWordStrict', value), [updateSetting]);
  const setAsrAutoResumeAfterAnswerEnabled = useCallback(
    (value) => updateSetting('asrAutoResumeAfterAnswerEnabled', value),
    [updateSetting]
  );
  const setAsrAutoResumeAfterAnswerDelayMs = useCallback(
    (value) => updateSetting('asrAutoResumeAfterAnswerDelayMs', value),
    [updateSetting]
  );
  const setAsrConversationAutoSubmitSilenceMs = useCallback(
    (value) => updateSetting('asrConversationAutoSubmitSilenceMs', value),
    [updateSetting]
  );
  const setAsrConversationContextStrategy = useCallback(
    (value) => updateSetting('asrConversationContextStrategy', value),
    [updateSetting]
  );
  const setAsrConversationContextRecentTurns = useCallback(
    (value) => updateSetting('asrConversationContextRecentTurns', value),
    [updateSetting]
  );
  const setAsrConversationContextMaxTokens = useCallback(
    (value) => updateSetting('asrConversationContextMaxTokens', value),
    [updateSetting]
  );
  const setGlobalPromptPrefix = useCallback((value) => updateSetting('globalPromptPrefix', value), [updateSetting]);
  const setAsrTextFilterEnabled = useCallback((value) => updateSetting('asrTextFilterEnabled', value), [updateSetting]);
  const setAsrTextFilterChatName = useCallback((value) => updateSetting('asrTextFilterChatName', value), [updateSetting]);
  const setAsrTextFilterTerms = useCallback((value) => updateSetting('asrTextFilterTerms', value), [updateSetting]);
  const setAsrTextFilterPrompt = useCallback((value) => updateSetting('asrTextFilterPrompt', value), [updateSetting]);
  const setSettingsActiveTab = useCallback((value) => updateSetting('settingsActiveTab', value), [updateSetting]);
  const setAsrMinRecordMs = useCallback((value) => updateSetting('asrMinRecordMs', value), [updateSetting]);
  const setAsrStopGraceMs = useCallback((value) => updateSetting('asrStopGraceMs', value), [updateSetting]);
  const setAsrFinalWaitMs = useCallback((value) => updateSetting('asrFinalWaitMs', value), [updateSetting]);
  const setAsrProviderType = useCallback((value) => updateSetting('asrProviderType', value), [updateSetting]);
  const setAsrFinalTimeoutStrategy = useCallback((value) => updateSetting('asrFinalTimeoutStrategy', value), [updateSetting]);
  const setSaucWsUrl = useCallback((value) => updateSetting('saucWsUrl', value), [updateSetting]);
  const setSaucResourceId = useCallback((value) => updateSetting('saucResourceId', value), [updateSetting]);
  const setSaucAppKey = useCallback((value) => updateSetting('saucAppKey', value), [updateSetting]);
  const setSaucAccessKey = useCallback((value) => updateSetting('saucAccessKey', value), [updateSetting]);
  const setSaucModelName = useCallback((value) => updateSetting('saucModelName', value), [updateSetting]);
  const setSaucSegmentDurationMs = useCallback((value) => updateSetting('saucSegmentDurationMs', value), [updateSetting]);
  const setSaucEnableItn = useCallback((value) => updateSetting('saucEnableItn', value), [updateSetting]);
  const setSaucEnablePunc = useCallback((value) => updateSetting('saucEnablePunc', value), [updateSetting]);
  const setSaucEnableDdc = useCallback((value) => updateSetting('saucEnableDdc', value), [updateSetting]);
  const setSaucShowUtterances = useCallback((value) => updateSetting('saucShowUtterances', value), [updateSetting]);
  const setSaucEnableNonstream = useCallback((value) => updateSetting('saucEnableNonstream', value), [updateSetting]);

  return {
    ...settings,
    settingsReady,
    settingsError,
    setTtsMode,
    setModelscopeVoice,
    setTtsSpeed,
    setTtsFetchConcurrency,
    setGuideEnabled,
    setContinuousTour,
    setTourRecordingEnabled,
    setPlayTourRecordingEnabled,
    setSelectedTourRecordingId,
    setGuideDuration,
    setGuideStyle,
    setQaAnswerTargetChars,
    setQaAudioCacheConfidenceThreshold,
    setQaAudioCacheLookupEnabled,
    setShowHistoryPanel,
    setShowDebugPanel,
    setTourZone,
    setAudienceProfile,
    setGroupMode,
    setSpeakerName,
    setTourSelectedStopIndex,
    setTourTemplateId,
    setTourStopsOverride,
    setTourStopDurationsOverride,
    setTourStopPromptOverrides,
    setTourGuideTemplates,
    setTourGuideTemplateId,
    setTourStopDurationTemplateKey,
    setTourStopDurationTemplates,
    setWakeWordEnabled,
    setWakeWord,
    setWakeWordCooldownMs,
    setWakeWordStrict,
    setAsrAutoResumeAfterAnswerEnabled,
    setAsrAutoResumeAfterAnswerDelayMs,
    setAsrConversationAutoSubmitSilenceMs,
    setAsrConversationContextStrategy,
    setAsrConversationContextRecentTurns,
    setAsrConversationContextMaxTokens,
    setGlobalPromptPrefix,
    setAsrTextFilterEnabled,
    setAsrTextFilterChatName,
    setAsrTextFilterTerms,
    setAsrTextFilterPrompt,
    setSettingsActiveTab,
    setAsrMinRecordMs,
    setAsrStopGraceMs,
    setAsrFinalWaitMs,
    setAsrProviderType,
    setAsrFinalTimeoutStrategy,
    setSaucWsUrl,
    setSaucResourceId,
    setSaucAppKey,
    setSaucAccessKey,
    setSaucModelName,
    setSaucSegmentDurationMs,
    setSaucEnableItn,
    setSaucEnablePunc,
    setSaucEnableDdc,
    setSaucShowUtterances,
    setSaucEnableNonstream,
  };
}
