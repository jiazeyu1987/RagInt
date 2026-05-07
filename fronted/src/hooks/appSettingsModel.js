import { TourTemplateManager } from '../managers/TourTemplateManager';
import {
  DEFAULT_ASR_FILTER_CHAT_NAME,
  DEFAULT_ASR_FILTER_PROMPT,
  DEFAULT_ASR_FILTER_TERMS,
} from '../config/asrFilter';

const ALLOWED_TTS_FETCH_CONCURRENCY = new Set([2, 4, 6, 8, 10]);
const ALLOWED_TTS_MODES = new Set(['sovtts1', 'sovtts2', 'modelscope', 'flash', 'sapi', 'edge']);
const ALLOWED_ASR_PROVIDER_TYPES = new Set(['voicekit_ws', 'sauc_ws']);
const ALLOWED_ASR_FINAL_TIMEOUT_STRATEGIES = new Set(['keep_partial', 'keep_input', 'clear_input']);
const ALLOWED_ASR_CONTEXT_STRATEGIES = new Set(['smart_recent_current', 'full']);
const ALLOWED_SETTINGS_TABS = new Set(['tts', 'debug', 'ops', 'qa', 'archive', 'asr', 'mode', 'stop_prompt', 'template']);
const FLASH_VOICE_OPTIONS = new Set(['longanyang', 'longanhuan']);
const STOP_DURATION_TEMPLATE_KEYS = ['tpl_1m', 'tpl_2m', 'tpl_3m', 'tpl_4m', 'tpl_5m'];
const STOP_DURATION_TEMPLATE_BASE_SECONDS = {
  tpl_1m: 60,
  tpl_2m: 120,
  tpl_3m: 180,
  tpl_4m: 240,
  tpl_5m: 300,
};
const DEFAULT_SETTINGS_TAB = 'tts';
const DEFAULT_SAUC_WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';
const DEFAULT_SAUC_RESOURCE_ID = 'volc.bigasr.sauc.duration';

function normalizeBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if (!text) return !!defaultValue;
  if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return true;
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') return false;
  return !!defaultValue;
}

function normalizeInteger(value, fallback, { min = null, max = null } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = Math.round(n);
  if (Number.isFinite(min)) out = Math.max(Number(min), out);
  if (Number.isFinite(max)) out = Math.min(Number(max), out);
  return out;
}

function normalizeNumber(value, fallback, { min = null, max = null } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (Number.isFinite(min)) out = Math.max(Number(min), out);
  if (Number.isFinite(max)) out = Math.min(Number(max), out);
  return out;
}

function normalizeTtsMode(value) {
  const mode = String(value || 'modelscope')
    .trim()
    .toLowerCase();
  if (mode === 'online') return 'modelscope';
  if (mode === 'local') return 'sovtts1';
  return ALLOWED_TTS_MODES.has(mode) ? mode : 'modelscope';
}

function normalizeTtsFetchConcurrency(value) {
  const n = Number(value);
  if (ALLOWED_TTS_FETCH_CONCURRENCY.has(n)) return n;
  return 4;
}

function normalizeAsrProviderType(value) {
  const providerType = String(value || 'voicekit_ws')
    .trim()
    .toLowerCase();
  return ALLOWED_ASR_PROVIDER_TYPES.has(providerType) ? providerType : 'voicekit_ws';
}

function normalizeAsrFinalTimeoutStrategy(value) {
  const strategy = String(value || 'keep_partial')
    .trim()
    .toLowerCase();
  return ALLOWED_ASR_FINAL_TIMEOUT_STRATEGIES.has(strategy) ? strategy : 'keep_partial';
}

function normalizeSaucEndpoint(value, fallback) {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function normalizeSaucWsUrlByMode(wsUrl, enableNonstream) {
  const text = String(wsUrl == null ? '' : wsUrl).trim();
  if (!text) return text;
  if (!!enableNonstream) return text;
  // Streaming mode should not use the nostream endpoint, otherwise only final text is returned.
  return text.includes('/bigmodel_nostream') ? text.replace('/bigmodel_nostream', '/bigmodel') : text;
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

function normalizeAutoResumeDelayMs(value, fallback = 2200) {
  return normalizeInteger(value, fallback, { min: 300, max: 20000 });
}

function normalizeAsrConversationAutoSubmitSilenceMs(value, fallback = 1200) {
  return normalizeInteger(value, fallback, { min: 500, max: 3000 });
}

function normalizeAsrConversationContextStrategy(value) {
  const strategy = String(value || 'smart_recent_current')
    .trim()
    .toLowerCase();
  return ALLOWED_ASR_CONTEXT_STRATEGIES.has(strategy) ? strategy : 'smart_recent_current';
}

function normalizeAsrConversationContextRecentTurns(value, fallback = 10) {
  return normalizeInteger(value, fallback, { min: 1, max: 20 });
}

function normalizeAsrConversationContextMaxTokens(value, fallback = 16000) {
  return normalizeInteger(value, fallback, { min: 2000, max: 64000 });
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
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

export function buildDefaultTourStopDurationTemplates() {
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

function buildInvalidPersistedSettingError(field, reason, value) {
  const err = new Error(`Invalid persisted application setting "${field}": ${reason}`);
  err.field = field;
  err.value = value;
  return err;
}

function hasOwnSetting(raw, field) {
  return Object.prototype.hasOwnProperty.call(raw, field);
}

function assertPersistedBoolean(raw, field) {
  if (!hasOwnSetting(raw, field)) return;
  const value = raw[field];
  if (typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value) && (value === 0 || value === 1)) return;
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return;
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') return;
  throw buildInvalidPersistedSettingError(field, 'expected a boolean value', value);
}

function assertPersistedInteger(raw, field, { min = null, max = null } = {}) {
  if (!hasOwnSetting(raw, field)) return;
  const value = raw[field];
  if (value == null) {
    throw buildInvalidPersistedSettingError(field, 'expected an integer value', value);
  }
  const text = typeof value === 'string' ? value.trim() : value;
  if (text === '') {
    throw buildInvalidPersistedSettingError(field, 'expected an integer value', value);
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw buildInvalidPersistedSettingError(field, 'expected an integer value', value);
  }
  const out = Math.round(n);
  if (Number.isFinite(min) && out < Number(min)) {
    throw buildInvalidPersistedSettingError(field, `must be at least ${Number(min)}`, value);
  }
  if (Number.isFinite(max) && out > Number(max)) {
    throw buildInvalidPersistedSettingError(field, `must be at most ${Number(max)}`, value);
  }
}

function assertPersistedNumber(raw, field, { min = null, max = null } = {}) {
  if (!hasOwnSetting(raw, field)) return;
  const value = raw[field];
  if (value == null) {
    throw buildInvalidPersistedSettingError(field, 'expected a number value', value);
  }
  const text = typeof value === 'string' ? value.trim() : value;
  if (text === '') {
    throw buildInvalidPersistedSettingError(field, 'expected a number value', value);
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw buildInvalidPersistedSettingError(field, 'expected a number value', value);
  }
  if (Number.isFinite(min) && n < Number(min)) {
    throw buildInvalidPersistedSettingError(field, `must be at least ${Number(min)}`, value);
  }
  if (Number.isFinite(max) && n > Number(max)) {
    throw buildInvalidPersistedSettingError(field, `must be at most ${Number(max)}`, value);
  }
}

function assertPersistedSaucEndpoint(raw, field) {
  if (!hasOwnSetting(raw, field)) return;
  const value = raw[field];
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    throw buildInvalidPersistedSettingError(field, 'expected a non-empty endpoint value', value);
  }
}

function assertPersistedEnum(raw, field, allowedValues, { aliases = {} } = {}) {
  if (!hasOwnSetting(raw, field)) return;
  const value = raw[field];
  const text = String(value == null ? '' : value).trim().toLowerCase();
  const normalized = aliases[text] || text;
  if (Array.from(allowedValues).some((allowed) => String(allowed).toLowerCase() === normalized)) return;
  throw buildInvalidPersistedSettingError(field, `expected one of: ${Array.from(allowedValues).join(', ')}`, value);
}

function assertPersistedDigitText(raw, field, { min = null, max = null } = {}) {
  if (!hasOwnSetting(raw, field)) return;
  const value = raw[field];
  const text = String(value == null ? '' : value).trim();
  if (!/^\d+$/.test(text)) {
    throw buildInvalidPersistedSettingError(field, 'expected a positive integer text value', value);
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw buildInvalidPersistedSettingError(field, 'expected a positive integer text value', value);
  }
  if (Number.isFinite(min) && n < Number(min)) {
    throw buildInvalidPersistedSettingError(field, `must be at least ${Number(min)}`, value);
  }
  if (Number.isFinite(max) && n > Number(max)) {
    throw buildInvalidPersistedSettingError(field, `must be at most ${Number(max)}`, value);
  }
}

function assertPersistedDecimalText(raw, field, { min = null, max = null } = {}) {
  if (!hasOwnSetting(raw, field)) return;
  const value = raw[field];
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    throw buildInvalidPersistedSettingError(field, 'expected a number text value', value);
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw buildInvalidPersistedSettingError(field, 'expected a number text value', value);
  }
  if (Number.isFinite(min) && n < Number(min)) {
    throw buildInvalidPersistedSettingError(field, `must be at least ${Number(min)}`, value);
  }
  if (Number.isFinite(max) && n > Number(max)) {
    throw buildInvalidPersistedSettingError(field, `must be at most ${Number(max)}`, value);
  }
}

export function assertValidPersistedSettings(raw) {
  [
    'saucEnableNonstream',
    'guideEnabled',
    'continuousTour',
    'tourRecordingEnabled',
    'playTourRecordingEnabled',
    'qaAudioCacheLookupEnabled',
    'showHistoryPanel',
    'showDebugPanel',
    'groupMode',
    'wakeWordEnabled',
    'wakeWordStrict',
    'asrAutoResumeAfterAnswerEnabled',
    'asrTextFilterEnabled',
    'saucEnableItn',
    'saucEnablePunc',
    'saucEnableDdc',
    'saucShowUtterances',
  ].forEach((field) => assertPersistedBoolean(raw, field));

  assertPersistedEnum(raw, 'ttsMode', ALLOWED_TTS_MODES, { aliases: { online: 'modelscope', local: 'sovtts1' } });
  assertPersistedEnum(raw, 'ttsFetchConcurrency', ALLOWED_TTS_FETCH_CONCURRENCY);
  assertPersistedEnum(raw, 'asrProviderType', ALLOWED_ASR_PROVIDER_TYPES);
  assertPersistedEnum(raw, 'asrFinalTimeoutStrategy', ALLOWED_ASR_FINAL_TIMEOUT_STRATEGIES);
  assertPersistedEnum(raw, 'asrConversationContextStrategy', ALLOWED_ASR_CONTEXT_STRATEGIES);
  assertPersistedEnum(raw, 'settingsActiveTab', ALLOWED_SETTINGS_TABS);
  assertPersistedEnum(raw, 'tourStopDurationTemplateKey', new Set(STOP_DURATION_TEMPLATE_KEYS));
  assertPersistedDigitText(raw, 'guideDuration', { min: 1, max: 3600 });
  assertPersistedDigitText(raw, 'qaAnswerTargetChars', { min: 1, max: 5000 });
  assertPersistedDecimalText(raw, 'qaAudioCacheConfidenceThreshold', { min: 0, max: 1 });
  assertPersistedNumber(raw, 'ttsSpeed', { min: 0.5, max: 3 });
  assertPersistedInteger(raw, 'tourSelectedStopIndex', { min: 0 });
  assertPersistedInteger(raw, 'wakeWordCooldownMs', { min: 0, max: 120000 });
  assertPersistedInteger(raw, 'asrAutoResumeAfterAnswerDelayMs', { min: 300, max: 20000 });
  assertPersistedInteger(raw, 'asrConversationAutoSubmitSilenceMs', { min: 500, max: 3000 });
  assertPersistedInteger(raw, 'asrConversationContextRecentTurns', { min: 1, max: 20 });
  assertPersistedInteger(raw, 'asrConversationContextMaxTokens', { min: 2000, max: 64000 });
  assertPersistedInteger(raw, 'asrMinRecordMs', { min: 200, max: 10000 });
  assertPersistedInteger(raw, 'asrStopGraceMs', { min: 0, max: 5000 });
  assertPersistedInteger(raw, 'asrFinalWaitMs', { min: 200, max: 10000 });
  assertPersistedInteger(raw, 'saucSegmentDurationMs', { min: 50, max: 1000 });
  assertPersistedSaucEndpoint(raw, 'saucWsUrl');
  assertPersistedSaucEndpoint(raw, 'saucResourceId');
}

export function buildSettingsError(phase, cause) {
  const action = phase === 'save' ? 'save' : 'load';
  const message = `Failed to ${action} application settings: ${String((cause && cause.message) || cause || 'unknown error')}`;
  const err = new Error(message);
  err.phase = phase;
  err.cause = cause;
  return err;
}

function normalizeSettingsTabKey(value) {
  const key = String(value || '').trim();
  return key || DEFAULT_SETTINGS_TAB;
}

export function buildDefaultSettings() {
  return {
    ttsMode: 'modelscope',
    modelscopeVoice: '',
    ttsSpeed: 1.0,
    ttsFetchConcurrency: 4,
    guideEnabled: true,
    continuousTour: false,
    tourRecordingEnabled: false,
    playTourRecordingEnabled: false,
    selectedTourRecordingId: '',
    guideDuration: '10',
    guideStyle: 'friendly',
    qaAnswerTargetChars: '10',
    qaAudioCacheConfidenceThreshold: '0.85',
    qaAudioCacheLookupEnabled: true,
    showHistoryPanel: false,
    showDebugPanel: false,
    tourZone: '',
    audienceProfile: '',
    groupMode: false,
    speakerName: '观众A',
    tourSelectedStopIndex: 0,
    tourTemplateId: '',
    tourStopsOverride: [],
    tourStopDurationsOverride: {},
    tourStopPromptOverrides: {},
    tourGuideTemplates: [],
    tourGuideTemplateId: '',
    tourStopDurationTemplateKey: STOP_DURATION_TEMPLATE_KEYS[0],
    tourStopDurationTemplates: buildDefaultTourStopDurationTemplates(),
    wakeWordEnabled: false,
    wakeWord: '你好小D',
    wakeWordCooldownMs: 5000,
    wakeWordStrict: false,
    asrAutoResumeAfterAnswerEnabled: true,
    asrAutoResumeAfterAnswerDelayMs: 2200,
    asrConversationAutoSubmitSilenceMs: 1200,
    asrConversationContextStrategy: 'smart_recent_current',
    asrConversationContextRecentTurns: 10,
    asrConversationContextMaxTokens: 16000,
    globalPromptPrefix: '',
    asrTextFilterEnabled: false,
    asrTextFilterChatName: DEFAULT_ASR_FILTER_CHAT_NAME,
    asrTextFilterTerms: DEFAULT_ASR_FILTER_TERMS,
    asrTextFilterPrompt: DEFAULT_ASR_FILTER_PROMPT,
    settingsActiveTab: DEFAULT_SETTINGS_TAB,
    asrMinRecordMs: 900,
    asrStopGraceMs: 480,
    asrFinalWaitMs: 1500,
    asrProviderType: 'voicekit_ws',
    asrFinalTimeoutStrategy: 'keep_partial',
    saucWsUrl: DEFAULT_SAUC_WS_URL,
    saucResourceId: DEFAULT_SAUC_RESOURCE_ID,
    saucAppKey: '',
    saucAccessKey: '',
    saucModelName: 'bigmodel',
    saucSegmentDurationMs: 200,
    saucEnableItn: true,
    saucEnablePunc: true,
    saucEnableDdc: true,
    saucShowUtterances: true,
    saucEnableNonstream: false,
  };
}

export function normalizeAppSettings(value) {
  const defaults = buildDefaultSettings();
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const ttsMode = normalizeTtsMode(raw.ttsMode);
  const saucEnableNonstream = normalizeBoolean(raw.saucEnableNonstream, defaults.saucEnableNonstream);
  const saucWsUrlRaw = normalizeSaucEndpoint(raw.saucWsUrl, defaults.saucWsUrl);
  const saucWsUrl = normalizeSaucWsUrlByMode(saucWsUrlRaw, saucEnableNonstream);
  let modelscopeVoice = String(raw.modelscopeVoice == null ? defaults.modelscopeVoice : raw.modelscopeVoice).trim();
  if (ttsMode === 'flash' && !FLASH_VOICE_OPTIONS.has(modelscopeVoice)) {
    modelscopeVoice = 'longanyang';
  }

  return {
    ttsMode,
    modelscopeVoice,
    ttsSpeed: normalizeNumber(raw.ttsSpeed, defaults.ttsSpeed, { min: 0.5, max: 3 }),
    ttsFetchConcurrency: normalizeTtsFetchConcurrency(raw.ttsFetchConcurrency),
    guideEnabled: normalizeBoolean(raw.guideEnabled, defaults.guideEnabled),
    continuousTour: normalizeBoolean(raw.continuousTour, defaults.continuousTour),
    tourRecordingEnabled: normalizeBoolean(raw.tourRecordingEnabled, defaults.tourRecordingEnabled),
    playTourRecordingEnabled: normalizeBoolean(raw.playTourRecordingEnabled, defaults.playTourRecordingEnabled),
    selectedTourRecordingId: String(raw.selectedTourRecordingId == null ? defaults.selectedTourRecordingId : raw.selectedTourRecordingId),
    guideDuration: normalizeGuideDuration(raw.guideDuration),
    guideStyle: String(raw.guideStyle == null ? defaults.guideStyle : raw.guideStyle).trim() || defaults.guideStyle,
    qaAnswerTargetChars: normalizeQaAnswerTargetChars(raw.qaAnswerTargetChars),
    qaAudioCacheConfidenceThreshold: normalizeQaAudioCacheConfidenceThreshold(raw.qaAudioCacheConfidenceThreshold),
    qaAudioCacheLookupEnabled: normalizeBoolean(raw.qaAudioCacheLookupEnabled, defaults.qaAudioCacheLookupEnabled),
    showHistoryPanel: normalizeBoolean(raw.showHistoryPanel, defaults.showHistoryPanel),
    showDebugPanel: normalizeBoolean(raw.showDebugPanel, defaults.showDebugPanel),
    tourZone: String(raw.tourZone == null ? defaults.tourZone : raw.tourZone),
    audienceProfile: String(raw.audienceProfile == null ? defaults.audienceProfile : raw.audienceProfile),
    groupMode: normalizeBoolean(raw.groupMode, defaults.groupMode),
    speakerName: String(raw.speakerName == null ? defaults.speakerName : raw.speakerName) || defaults.speakerName,
    tourSelectedStopIndex: normalizeInteger(raw.tourSelectedStopIndex, defaults.tourSelectedStopIndex, { min: 0 }),
    tourTemplateId: String(raw.tourTemplateId == null ? defaults.tourTemplateId : raw.tourTemplateId),
    tourStopsOverride: normalizeStringList(raw.tourStopsOverride),
    tourStopDurationsOverride: normalizeTourStopDurationsOverride(raw.tourStopDurationsOverride),
    tourStopPromptOverrides: normalizeTourStopPromptOverrides(raw.tourStopPromptOverrides),
    tourGuideTemplates: normalizeTourGuideTemplates(raw.tourGuideTemplates),
    tourGuideTemplateId: String(raw.tourGuideTemplateId == null ? defaults.tourGuideTemplateId : raw.tourGuideTemplateId),
    tourStopDurationTemplateKey: normalizeTourStopDurationTemplateKey(raw.tourStopDurationTemplateKey),
    tourStopDurationTemplates: normalizeTourStopDurationTemplates(raw.tourStopDurationTemplates),
    wakeWordEnabled: normalizeBoolean(raw.wakeWordEnabled, defaults.wakeWordEnabled),
    wakeWord: String(raw.wakeWord == null ? defaults.wakeWord : raw.wakeWord) || defaults.wakeWord,
    wakeWordCooldownMs: normalizeInteger(raw.wakeWordCooldownMs, defaults.wakeWordCooldownMs, { min: 0, max: 120000 }),
    wakeWordStrict: normalizeBoolean(raw.wakeWordStrict, defaults.wakeWordStrict),
    asrAutoResumeAfterAnswerEnabled: normalizeBoolean(raw.asrAutoResumeAfterAnswerEnabled, defaults.asrAutoResumeAfterAnswerEnabled),
    asrAutoResumeAfterAnswerDelayMs: normalizeAutoResumeDelayMs(
      raw.asrAutoResumeAfterAnswerDelayMs,
      defaults.asrAutoResumeAfterAnswerDelayMs
    ),
    asrConversationAutoSubmitSilenceMs: normalizeAsrConversationAutoSubmitSilenceMs(
      raw.asrConversationAutoSubmitSilenceMs,
      defaults.asrConversationAutoSubmitSilenceMs
    ),
    asrConversationContextStrategy: normalizeAsrConversationContextStrategy(raw.asrConversationContextStrategy),
    asrConversationContextRecentTurns: normalizeAsrConversationContextRecentTurns(
      raw.asrConversationContextRecentTurns,
      defaults.asrConversationContextRecentTurns
    ),
    asrConversationContextMaxTokens: normalizeAsrConversationContextMaxTokens(
      raw.asrConversationContextMaxTokens,
      defaults.asrConversationContextMaxTokens
    ),
    globalPromptPrefix: String(raw.globalPromptPrefix == null ? defaults.globalPromptPrefix : raw.globalPromptPrefix),
    asrTextFilterEnabled: normalizeBoolean(raw.asrTextFilterEnabled, defaults.asrTextFilterEnabled),
    asrTextFilterChatName:
      String(raw.asrTextFilterChatName == null ? defaults.asrTextFilterChatName : raw.asrTextFilterChatName).trim() ||
      defaults.asrTextFilterChatName,
    asrTextFilterTerms: String(raw.asrTextFilterTerms == null ? defaults.asrTextFilterTerms : raw.asrTextFilterTerms),
    asrTextFilterPrompt:
      String(raw.asrTextFilterPrompt == null ? defaults.asrTextFilterPrompt : raw.asrTextFilterPrompt) || defaults.asrTextFilterPrompt,
    settingsActiveTab: normalizeSettingsTabKey(raw.settingsActiveTab),
    asrMinRecordMs: normalizeInteger(raw.asrMinRecordMs, defaults.asrMinRecordMs, { min: 200, max: 10000 }),
    asrStopGraceMs: normalizeInteger(raw.asrStopGraceMs, defaults.asrStopGraceMs, { min: 0, max: 5000 }),
    asrFinalWaitMs: normalizeInteger(raw.asrFinalWaitMs, defaults.asrFinalWaitMs, { min: 200, max: 10000 }),
    asrProviderType: normalizeAsrProviderType(raw.asrProviderType),
    asrFinalTimeoutStrategy: normalizeAsrFinalTimeoutStrategy(raw.asrFinalTimeoutStrategy),
    saucWsUrl,
    saucResourceId: normalizeSaucEndpoint(raw.saucResourceId, defaults.saucResourceId),
    saucAppKey: String(raw.saucAppKey == null ? defaults.saucAppKey : raw.saucAppKey).trim(),
    saucAccessKey: String(raw.saucAccessKey == null ? defaults.saucAccessKey : raw.saucAccessKey).trim(),
    saucModelName: String(raw.saucModelName == null ? defaults.saucModelName : raw.saucModelName).trim() || defaults.saucModelName,
    saucSegmentDurationMs: normalizeInteger(raw.saucSegmentDurationMs, defaults.saucSegmentDurationMs, { min: 50, max: 1000 }),
    saucEnableItn: normalizeBoolean(raw.saucEnableItn, defaults.saucEnableItn),
    saucEnablePunc: normalizeBoolean(raw.saucEnablePunc, defaults.saucEnablePunc),
    saucEnableDdc: normalizeBoolean(raw.saucEnableDdc, defaults.saucEnableDdc),
    saucShowUtterances: normalizeBoolean(raw.saucShowUtterances, defaults.saucShowUtterances),
    saucEnableNonstream,
  };
}
