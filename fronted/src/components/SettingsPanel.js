import React, { useEffect, useMemo, useState } from 'react';
import { SettingsDrawer } from './SettingsDrawer';
import { SettingsToggles } from './SettingsToggles';
import { StagePanel } from './StagePanel';
import { TourModePanel } from './TourModePanel';
import { QaAudioCachePanel } from './QaAudioCachePanel';
import { RecordingArchivePreviewPanel } from './RecordingArchivePreviewPanel';

const TABS = [
  { key: 'tts', label: 'TTS设置' },
  { key: 'debug', label: 'Debug设置' },
  { key: 'ops', label: '运维设置' },
  { key: 'qa', label: '问答缓存' },
  { key: 'archive', label: '存档设置' },
  { key: 'asr', label: 'ASR设置' },
  { key: 'mode', label: '讲解设置' },
  { key: 'stop_prompt', label: '站点提示词' },
  { key: 'template', label: '模板编辑' },
];
const SETTINGS_ACTIVE_TAB_KEY = 'settingsActiveTab';
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

function normalizeSettingsTabKey(value) {
  const key = String(value || '').trim();
  return TABS.some((tab) => tab.key === key) ? key : DEFAULT_SETTINGS_TAB;
}

function getOfficialTtsVoiceOptions(mode) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (normalizedMode === 'flash') return FLASH_VOICE_OPTIONS;
  if (normalizedMode === 'modelscope') return MODELSCOPE_VOICE_OPTIONS;
  return [];
}

function SettingsGroup({ title, children }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">{title}</div>
      <div className="settings-group-body">{children}</div>
    </div>
  );
}

function normalizeStopPromptMap(value) {
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

function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Settings tabs">
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

function TtsTab({ controlBarProps, ttsMode, modelscopeVoice, onChangeModelscopeVoice, ttsFetchConcurrency, onChangeTtsFetchConcurrency }) {
  const c = controlBarProps || {};
  const activeTtsMode = String(ttsMode || c.ttsMode || '').trim().toLowerCase();
  const officialVoiceOptions = useMemo(() => getOfficialTtsVoiceOptions(activeTtsMode), [activeTtsMode]);
  const currentVoiceValue = String(modelscopeVoice || '').trim();
  const voiceOptions = useMemo(() => {
    if (!currentVoiceValue) return officialVoiceOptions;
    if (officialVoiceOptions.includes(currentVoiceValue)) return officialVoiceOptions;
    return [currentVoiceValue, ...officialVoiceOptions];
  }, [currentVoiceValue, officialVoiceOptions]);
  return (
    <>
      <SettingsGroup title="语音开关">
        <div className="settings-section">
          <label className="settings-toggle">
            <input type="checkbox" checked={!!c.ttsEnabled} onChange={(e) => c.onChangeTtsEnabled && c.onChangeTtsEnabled(e.target.checked)} />
            <span>启用TTS播报</span>
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title="语音参数">
        <div className="settings-form">
          <label className="settings-field">
            <span>TTS提供方</span>
            <select value={String(c.ttsMode || 'modelscope')} onChange={(e) => c.onChangeTtsMode && c.onChangeTtsMode(e.target.value)}>
              <option value="sovtts1">SOVTTS1</option>
              <option value="sovtts2">SOVTTS2</option>
              <option value="modelscope">ModelScope</option>
              <option value="flash">Flash(cosyvoice-v3-flash)</option>
              <option value="sapi">SAPI</option>
              <option value="edge">Edge</option>
            </select>
          </label>

          <label className="settings-field">
            <span>语速</span>
            <select value={String(c.ttsSpeed || 1.0)} onChange={(e) => c.onChangeTtsSpeed && c.onChangeTtsSpeed(Number(e.target.value) || 1.0)}>
              <option value="1">标准(1.0x)</option>
              <option value="1.25">加速(1.25x)</option>
              <option value="1.5">更快(1.5x)</option>
            </select>
          </label>

          <label className="settings-field">
            <span>TTS并发数</span>
            <select value={String(ttsFetchConcurrency || 4)} onChange={(e) => onChangeTtsFetchConcurrency && onChangeTtsFetchConcurrency(Number(e.target.value) || 4)}>
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="6">6</option>
              <option value="8">8</option>
              <option value="10">10</option>
            </select>
          </label>

          {(activeTtsMode === 'modelscope' || activeTtsMode === 'flash') ? (
            <label className="settings-field">
              <span>{activeTtsMode === 'flash' ? 'Flash voice id' : 'ModelScope voice id'}</span>
              <select value={currentVoiceValue} onChange={(e) => onChangeModelscopeVoice && onChangeModelscopeVoice(e.target.value)}>
                <option value="">Select voice id</option>
                {voiceOptions.map((voiceId) => (
                  <option key={voiceId} value={voiceId}>
                    {voiceId}
                    {voiceId === currentVoiceValue && !officialVoiceOptions.includes(voiceId) ? ' (current custom)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </SettingsGroup>
    </>
  );
}

function DebugTab({ showHistoryPanel, onChangeShowHistoryPanel, showDebugPanel, onChangeShowDebugPanel, controlBarProps }) {
  const c = controlBarProps || {};
  const stateText =
    c.tourState && c.tourState.mode
      ? `${c.tourState.mode}${Number.isFinite(c.tourState.stopIndex) ? ` / 第${Number(c.tourState.stopIndex) + 1}站` : ''}`
      : 'unknown';

  return (
    <>
      <SettingsGroup title="面板开关">
        <SettingsToggles
          showHistoryPanel={showHistoryPanel}
          onChangeShowHistoryPanel={onChangeShowHistoryPanel}
          showDebugPanel={showDebugPanel}
          onChangeShowDebugPanel={onChangeShowDebugPanel}
        />
      </SettingsGroup>
      <SettingsGroup title="状态快照">
        <div className="settings-form">
          <div className="settings-field">
            <span>讲解状态机</span>
            <div>{stateText}</div>
          </div>
          <div className="settings-field">
            <span>当前意图</span>
            <div>{(c.currentIntent && c.currentIntent.intent) || 'none'}</div>
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}

function OpsTab({ stagePanelProps, onQuickSummary, onPrevStop, onNextStop }) {
  return (
    <SettingsGroup title="运维动作">
      <StagePanel {...(stagePanelProps || {})} />
      <div className="settings-divider" />
      <div className="settings-actions">
        <button type="button" className="settings-action-btn" onClick={onQuickSummary}>
          30秒总结
        </button>
        <button type="button" className="settings-action-btn" onClick={onPrevStop}>
          上一站
        </button>
        <button type="button" className="settings-action-btn" onClick={onNextStop}>
          下一站
        </button>
      </div>
    </SettingsGroup>
  );
}

function QaTab({ controlBarProps }) {
  const c = controlBarProps || {};
  return (
    <>
      <SettingsGroup title="问答配置">
        <div className="settings-form">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.qaAudioCacheLookupEnabled}
              onChange={(e) => c.onChangeQaAudioCacheLookupEnabled && c.onChangeQaAudioCacheLookupEnabled(e.target.checked)}
            />
            <span>开启问答缓存命中（关闭后仅写入不读取）</span>
          </label>
          <label className="settings-field">
            <span>问答回答字数</span>
            <input
              type="number"
              min="1"
              step="1"
              value={String(c.qaAnswerTargetChars || '10')}
              onChange={(e) => c.onChangeQaAnswerTargetChars && c.onChangeQaAnswerTargetChars(e.target.value)}
              placeholder="最小1"
            />
          </label>
          <label className="settings-field">
            <span>缓存置信度阈值</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={String(c.qaAudioCacheConfidenceThreshold || '0.85')}
              onChange={(e) => c.onChangeQaAudioCacheConfidenceThreshold && c.onChangeQaAudioCacheConfidenceThreshold(e.target.value)}
              placeholder="0~1"
            />
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title="问答语音缓存管理">
        <QaAudioCachePanel />
      </SettingsGroup>
    </>
  );
}

function ArchiveTab({ controlBarProps, ttsMode, modelscopeVoice }) {
  const c = controlBarProps || {};
  const resolvedProvider = String(c.ttsMode || ttsMode || '').trim();
  const resolvedVoice =
    resolvedProvider.toLowerCase() === 'modelscope' || resolvedProvider.toLowerCase() === 'flash' ? String(modelscopeVoice || '').trim() : '';
  const resolvedSpeed = Number(c.ttsSpeed);

  return (
    <>
      <SettingsGroup title="录制与回放">
        <div className="settings-form">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.tourRecordingEnabled}
              onChange={(e) => c.onChangeTourRecordingEnabled && c.onChangeTourRecordingEnabled(e.target.checked)}
              disabled={!c.guideEnabled}
            />
            <span>录制讲解</span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.playTourRecordingEnabled}
              onChange={(e) => c.onChangePlayTourRecordingEnabled && c.onChangePlayTourRecordingEnabled(e.target.checked)}
              disabled={!c.guideEnabled}
            />
            <span>播放存档</span>
          </label>

          {c.playTourRecordingEnabled ? (
            <label className="settings-field">
              <span>选择存档</span>
              <select value={String(c.selectedTourRecordingId || '')} onChange={(e) => c.onChangeSelectedTourRecordingId && c.onChangeSelectedTourRecordingId(e.target.value)}>
                <option value="">请选择</option>
                {(c.tourRecordingOptions || []).map((r) => (
                  <option key={String(r.recording_id)} value={String(r.recording_id)}>
                    {r.label || String(r.recording_id)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {c.playTourRecordingEnabled ? (
            <div className="settings-actions">
              <button type="button" className="settings-action-btn" onClick={() => c.onRenameSelectedTourRecording && c.onRenameSelectedTourRecording()}>
                重命名
              </button>
              <button type="button" className="settings-action-btn" onClick={() => c.onDeleteSelectedTourRecording && c.onDeleteSelectedTourRecording()}>
                删除
              </button>
            </div>
          ) : null}
        </div>
      </SettingsGroup>

      {c.playTourRecordingEnabled ? (
        <SettingsGroup title="存档文字与语音预览">
          <RecordingArchivePreviewPanel
            recordingId={String(c.selectedTourRecordingId || '')}
            ttsProvider={resolvedProvider}
            ttsVoice={resolvedVoice}
            ttsSpeed={Number.isFinite(resolvedSpeed) ? resolvedSpeed : 1.0}
          />
        </SettingsGroup>
      ) : null}
    </>
  );
}

function AsrTab({ controlBarProps }) {
  const c = controlBarProps || {};
  return (
    <SettingsGroup title="唤醒词设置">
      <div className="settings-form">
        <label className="settings-toggle">
          <input type="checkbox" checked={!!c.wakeWordEnabled} onChange={(e) => c.onChangeWakeWordEnabled && c.onChangeWakeWordEnabled(e.target.checked)} />
          <span>启用唤醒词</span>
        </label>

        {c.wakeWordEnabled ? (
          <label className="settings-field">
            <span>唤醒词</span>
            <input value={String(c.wakeWord || '')} onChange={(e) => c.onChangeWakeWord && c.onChangeWakeWord(e.target.value)} placeholder="例如：你好小D" />
          </label>
        ) : null}

        {c.wakeWordEnabled ? (
          <label className="settings-field">
            <span>冷却时间(ms)</span>
            <input
              value={String(c.wakeWordCooldownMs || '')}
              onChange={(e) => c.onChangeWakeWordCooldownMs && c.onChangeWakeWordCooldownMs(Number(e.target.value) || 0)}
              placeholder="5000"
            />
          </label>
        ) : null}

        {c.wakeWordEnabled ? (
          <label className="settings-toggle">
            <input type="checkbox" checked={!!c.wakeWordStrict} onChange={(e) => c.onChangeWakeWordStrict && c.onChangeWakeWordStrict(e.target.checked)} />
            <span>严格匹配</span>
          </label>
        ) : null}
      </div>
    </SettingsGroup>
  );
}

function ModeTab({ controlBarProps }) {
  const c = controlBarProps || {};
  const profiles = (c.tourMeta && Array.isArray(c.tourMeta.profiles) ? c.tourMeta.profiles : []).map((x) => String(x || '').trim()).filter(Boolean);
  const guideEnabled = !!c.guideEnabled;
  const onChangeGuideEnabled = c.onChangeGuideEnabled;

  useEffect(() => {
    if (!guideEnabled && typeof onChangeGuideEnabled === 'function') {
      onChangeGuideEnabled(true);
    }
  }, [guideEnabled, onChangeGuideEnabled]);

  return (
    <SettingsGroup title="讲解设置">
      <div className="settings-form">
        <label className="settings-toggle">
          <input type="checkbox" checked={!!c.continuousTour} onChange={(e) => c.onChangeContinuousTour && c.onChangeContinuousTour(e.target.checked)} />
          <span>连续讲解</span>
        </label>

        {profiles.length ? (
          <label className="settings-field">
            <span>人群画像</span>
            <select value={String(c.audienceProfile || '')} onChange={(e) => c.onChangeAudienceProfile && c.onChangeAudienceProfile(e.target.value)}>
              {profiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
function StopPromptTab({ controlBarProps }) {
  const c = controlBarProps || {};
  const savedPromptMap = useMemo(() => {
    const src = c.tourStopPromptOverrides;
    const normalizedFromState = normalizeStopPromptMap(src);
    if (Object.keys(normalizedFromState).length) return normalizedFromState;
    try {
      const raw = localStorage.getItem('tourStopPromptOverrides');
      if (!raw) return {};
      return normalizeStopPromptMap(JSON.parse(raw));
    } catch (_) {
      // ignore
    }
    return {};
  }, [c.tourStopPromptOverrides]);
  const [draftPromptMap, setDraftPromptMap] = useState(savedPromptMap);
  const savedPromptMapSignature = useMemo(() => JSON.stringify(savedPromptMap || {}), [savedPromptMap]);

  useEffect(() => {
    setDraftPromptMap(savedPromptMap);
  }, [savedPromptMap, savedPromptMapSignature]);

  const mergedStops = [];
  const pushStop = (name) => {
    const s = String(name || '').trim();
    if (!s) return;
    if (mergedStops.includes(s)) return;
    mergedStops.push(s);
  };

  (Array.isArray(c.tourStopsOverride) ? c.tourStopsOverride : []).forEach(pushStop);
  (Array.isArray(c.tourStops) ? c.tourStops : []).forEach(pushStop);
  Object.keys(draftPromptMap || {}).forEach(pushStop);

  const onSave = () => {
    const normalized = normalizeStopPromptMap(draftPromptMap);
    try {
      localStorage.setItem('tourStopPromptOverrides', JSON.stringify(normalized));
    } catch (_) {
      // ignore
    }
    if (typeof c.onSaveTourStopPromptOverrides === 'function') {
      c.onSaveTourStopPromptOverrides(normalized);
      return;
    }
    if (typeof c.onClearTourStopPromptOverrides === 'function') c.onClearTourStopPromptOverrides();
    if (typeof c.onChangeTourStopPromptOverride === 'function') {
      Object.keys(normalized || {}).forEach((stopName) => {
        c.onChangeTourStopPromptOverride(stopName, normalized[stopName]);
      });
    }
  };

  const onClear = () => {
    const confirmed = window.confirm('确认清除全部站点提示词吗？');
    if (!confirmed) return;
    try {
      localStorage.setItem('tourStopPromptOverrides', JSON.stringify({}));
    } catch (_) {
      // ignore
    }
    setDraftPromptMap({});
    if (typeof c.onSaveTourStopPromptOverrides === 'function') {
      c.onSaveTourStopPromptOverrides({});
      return;
    }
    if (typeof c.onClearTourStopPromptOverrides === 'function') c.onClearTourStopPromptOverrides();
  };

  return (
    <SettingsGroup title="按站点配置附加提示词">
      <div className="settings-actions" style={{ marginBottom: 10 }}>
        <button type="button" className="settings-action-btn settings-action-btn-danger" onClick={onClear}>
          清除
        </button>
        <button type="button" className="settings-action-btn settings-action-btn-primary" onClick={onSave}>
          保存
        </button>
      </div>

      {!mergedStops.length ? <div className="debug-muted">当前没有可配置的站点，请先加载讲解路线或模板。</div> : null}

      <div className="settings-form">
        {mergedStops.map((stopName) => (
          <label className="settings-field" key={stopName}>
            <span>{stopName}</span>
            <textarea
              className="settings-textarea"
              rows={3}
              value={String(draftPromptMap[stopName] || '')}
              onChange={(e) => {
                const nextValue = e.target.value;
                setDraftPromptMap((prev) => {
                  const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
                  return { ...base, [stopName]: nextValue };
                });
              }}
              placeholder="该站点讲解时会附加到提示词中，例如：重点突出某产品、避免某类表述、必须包含某信息。"
            />
          </label>
        ))}
      </div>
    </SettingsGroup>
  );
}

function TemplateTab({ tourModePanelProps }) {
  return (
    <SettingsGroup title="模板编辑">
      <TourModePanel {...(tourModePanelProps || {})} />
    </SettingsGroup>
  );
}

export function SettingsPanel({
  open,
  onClose,
  docked,
  showHistoryPanel,
  onChangeShowHistoryPanel,
  showDebugPanel,
  onChangeShowDebugPanel,
  controlBarProps,
  stagePanelProps,
  tourModePanelProps,
  ttsMode,
  modelscopeVoice,
  onChangeModelscopeVoice,
  ttsFetchConcurrency,
  onChangeTtsFetchConcurrency,
  groupMode,
  speakerName,
  onChangeSpeakerName,
  questionPriority,
  onChangeQuestionPriority,
  onQuickSummary,
  onPrevStop,
  onNextStop,
}) {
  void [groupMode, speakerName, onChangeSpeakerName, questionPriority, onChangeQuestionPriority];
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_ACTIVE_TAB_KEY);
      return normalizeSettingsTabKey(saved);
    } catch (_) {
      return DEFAULT_SETTINGS_TAB;
    }
  });

  useEffect(() => {
    const normalized = normalizeSettingsTabKey(activeTab);
    if (normalized !== activeTab) {
      setActiveTab(normalized);
      return;
    }
    try {
      localStorage.setItem(SETTINGS_ACTIVE_TAB_KEY, normalized);
    } catch (_) {
      // ignore
    }
  }, [activeTab]);

  const onTabChange = (nextTab) => {
    setActiveTab(normalizeSettingsTabKey(nextTab));
  };

  const tabContent = useMemo(() => {
    if (activeTab === 'tts') {
      return (
        <TtsTab
          controlBarProps={controlBarProps}
          ttsMode={ttsMode}
          modelscopeVoice={modelscopeVoice}
          onChangeModelscopeVoice={onChangeModelscopeVoice}
          ttsFetchConcurrency={ttsFetchConcurrency}
          onChangeTtsFetchConcurrency={onChangeTtsFetchConcurrency}
        />
      );
    }
    if (activeTab === 'debug') {
      return (
        <DebugTab
          showHistoryPanel={showHistoryPanel}
          onChangeShowHistoryPanel={onChangeShowHistoryPanel}
          showDebugPanel={showDebugPanel}
          onChangeShowDebugPanel={onChangeShowDebugPanel}
          controlBarProps={controlBarProps}
        />
      );
    }
    if (activeTab === 'ops') {
      return <OpsTab stagePanelProps={stagePanelProps} onQuickSummary={onQuickSummary} onPrevStop={onPrevStop} onNextStop={onNextStop} />;
    }
    if (activeTab === 'qa') {
      return <QaTab controlBarProps={controlBarProps} />;
    }
    if (activeTab === 'archive') {
      return <ArchiveTab controlBarProps={controlBarProps} ttsMode={ttsMode} modelscopeVoice={modelscopeVoice} />;
    }
    if (activeTab === 'asr') {
      return <AsrTab controlBarProps={controlBarProps} />;
    }
    if (activeTab === 'mode') {
      return <ModeTab controlBarProps={controlBarProps} />;
    }
    if (activeTab === 'stop_prompt') {
      return <StopPromptTab controlBarProps={controlBarProps} />;
    }
    return <TemplateTab tourModePanelProps={tourModePanelProps} />;
  }, [
    activeTab,
    controlBarProps,
    ttsMode,
    modelscopeVoice,
    onChangeModelscopeVoice,
    ttsFetchConcurrency,
    onChangeTtsFetchConcurrency,
    showHistoryPanel,
    onChangeShowHistoryPanel,
    showDebugPanel,
    onChangeShowDebugPanel,
    stagePanelProps,
    onQuickSummary,
    onPrevStop,
    onNextStop,
    tourModePanelProps,
  ]);

  if (docked) {
    return (
      <aside className="settings-docked" aria-label="设置">
        <div className="settings-header settings-header-docked">
          <div className="settings-title">设置</div>
        </div>
        <div className="settings-body">
          <TabBar activeTab={activeTab} onTabChange={onTabChange} />
          <div className="settings-tab-panel">{tabContent}</div>
        </div>
      </aside>
    );
  }

  return (
    <SettingsDrawer open={open} title="设置" onClose={onClose}>
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />
      <div className="settings-tab-panel">{tabContent}</div>
    </SettingsDrawer>
  );
}
