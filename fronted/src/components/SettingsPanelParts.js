import React from 'react';

const TABS = [
  { key: 'tts', label: '语音合成设置' },
  { key: 'debug', label: '调试设置' },
  { key: 'ops', label: '运维设置' },
  { key: 'qa', label: '问答缓存' },
  { key: 'archive', label: '存档设置' },
  { key: 'asr', label: '语音识别设置' },
  { key: 'mode', label: '讲解设置' },
  { key: 'stop_prompt', label: '站点提示词' },
  { key: 'template', label: '模板编辑' },
];
const DEFAULT_SETTINGS_TAB = 'tts';
const MODELSCOPE_VOICE_OPTIONS = [
  'longxiaochun',
  'longfeicheng',
  'longhua',
  'longxiaoxia_v2',
  'longxiaocheng',
  'longlaotie',
  'longwan',
  'longcheng',
  'longhua_v2',
  'loongbella',
  'loongstella',
  'loongwilliam',
  'longcheng_v2',
  'loongsamuel',
];
const FLASH_VOICE_OPTIONS = ['longanyang', 'longanhuan'];
const LEGACY_FALLBACK_STOPS = new Set([
  'company_overview',
  'core_products',
  'orthopedics',
  'urology',
  'other_products_and_scenarios',
  'summary_and_qa',
]);

export function normalizeStopNameList(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('settings_stop_list_invalid');
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

export function stripLegacyFallbackStops(stops) {
  const list = normalizeStopNameList(stops);
  if (!list.length) return [];
  const hasBusinessStops = list.some((name) => !LEGACY_FALLBACK_STOPS.has(name));
  if (!hasBusinessStops) return list;
  return list.filter((name) => !LEGACY_FALLBACK_STOPS.has(name));
}

export function normalizeSettingsTabKey(value) {
  const key = String(value == null ? '' : value).trim();
  if (!key) return DEFAULT_SETTINGS_TAB;
  if (TABS.some((tab) => tab.key === key)) return key;
  throw new Error('settings_active_tab_invalid');
}

export function getOfficialTtsVoiceOptions(mode) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (normalizedMode === 'flash') return FLASH_VOICE_OPTIONS;
  if (normalizedMode === 'modelscope') return MODELSCOPE_VOICE_OPTIONS;
  return [];
}

export function SettingsGroup({ title, children }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">{title}</div>
      <div className="settings-group-body">{children}</div>
    </div>
  );
}

export function normalizeStopPromptMap(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('settings_stop_prompt_overrides_invalid');
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

export function requireOptionalArray(value, errorCode) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(errorCode);
  return value;
}

export function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="设置标签页">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`settings-tab-btn${activeTab === tab.key ? ' is-active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

