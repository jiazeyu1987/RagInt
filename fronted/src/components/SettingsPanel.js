import React, { useMemo, useState } from 'react';
import { SettingsDrawer } from './SettingsDrawer';
import { SettingsToggles } from './SettingsToggles';
import { StagePanel } from './StagePanel';
import { TourModePanel } from './TourModePanel';
import { SellingPointsPanel } from './SellingPointsPanel';
import { QaAudioCachePanel } from './QaAudioCachePanel';

const TABS = [
  { key: 'tts', label: 'TTS设置' },
  { key: 'debug', label: 'Debug设置' },
  { key: 'ops', label: '运维设置' },
  { key: 'archive', label: '存档设置' },
  { key: 'asr', label: 'ASR设置' },
  { key: 'mode', label: '模式设置' },
];

function SettingsGroup({ title, children }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">{title}</div>
      <div className="settings-group-body">{children}</div>
    </div>
  );
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
            <span>TTS提供商</span>
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
            <select
              value={String(ttsFetchConcurrency || 4)}
              onChange={(e) => onChangeTtsFetchConcurrency && onChangeTtsFetchConcurrency(Number(e.target.value) || 4)}
            >
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="6">6</option>
              <option value="8">8</option>
              <option value="10">10</option>
            </select>
          </label>

          {String(ttsMode || c.ttsMode || '').toLowerCase() === 'modelscope' ? (
            <label className="settings-field">
              <span>ModelScope音色(voice id)</span>
              <input
                value={modelscopeVoice}
                onChange={(e) => onChangeModelscopeVoice && onChangeModelscopeVoice(e.target.value)}
                placeholder="例如：cosyvoice-v3-plus-xxxx / cosyvoice-v3-plus-myvoice-..."
              />
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

function OpsTab({ controlBarProps, stagePanelProps, onQuickSummary, onPrevStop, onNextStop, sellingPointsStopName }) {
  const c = controlBarProps || {};
  return (
    <>
      <SettingsGroup title="会话设置">
        <div className="settings-form">
          <label className="settings-field">
            <span>Chat(会话)</span>
            <select value={String(c.selectedChat || '')} onChange={(e) => c.onChangeSelectedChat && c.onChangeSelectedChat(e.target.value)}>
              {(Array.isArray(c.chatOptions) && c.chatOptions.length ? c.chatOptions : [c.selectedChat || '']).map((name) => (
                <option key={String(name)} value={String(name)}>
                  {String(name)}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-toggle">
            <input type="checkbox" checked={!!c.useAgentMode} onChange={(e) => c.onChangeUseAgentMode && c.onChangeUseAgentMode(e.target.checked)} />
            <span>Agent模式</span>
          </label>

          {c.useAgentMode ? (
            <label className="settings-field">
              <span>Agent</span>
              <select value={String(c.selectedAgentId || '')} onChange={(e) => c.onChangeSelectedAgentId && c.onChangeSelectedAgentId(e.target.value)}>
                <option value="">请选择Agent</option>
                {(Array.isArray(c.agentOptions) ? c.agentOptions : []).map((a) => {
                  const id = String((a && a.id) || '');
                  const name = String((a && a.title) || id);
                  return (
                    <option key={id || name} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : null}
        </div>
      </SettingsGroup>

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

      <SettingsGroup title={`卖点库：${String(sellingPointsStopName || '').trim() || '当前站点'}`}>
        <SellingPointsPanel stopName={sellingPointsStopName} hideTitle />
      </SettingsGroup>

      <SettingsGroup title="问答语音缓存管理">
        <QaAudioCachePanel />
      </SettingsGroup>
    </>
  );
}

function ArchiveTab({ controlBarProps }) {
  const c = controlBarProps || {};
  return (
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
            <select
              value={String(c.selectedTourRecordingId || '')}
              onChange={(e) => c.onChangeSelectedTourRecordingId && c.onChangeSelectedTourRecordingId(e.target.value)}
            >
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

function ModeTab({ controlBarProps, tourModePanelProps }) {
  const c = controlBarProps || {};
  const zones = (c.tourMeta && Array.isArray(c.tourMeta.zones) ? c.tourMeta.zones : []).map((x) => String(x || '').trim()).filter(Boolean);
  const profiles = (c.tourMeta && Array.isArray(c.tourMeta.profiles) ? c.tourMeta.profiles : []).map((x) => String(x || '').trim()).filter(Boolean);
  return (
    <>
      <SettingsGroup title="讲解参数">
        <div className="settings-form">
          <label className="settings-toggle">
            <input type="checkbox" checked={!!c.guideEnabled} onChange={(e) => c.onChangeGuideEnabled && c.onChangeGuideEnabled(e.target.checked)} />
            <span>启用展厅讲解</span>
          </label>

          {c.guideEnabled ? (
            <label className="settings-field">
              <span>讲解时长</span>
              <select value={String(c.guideDuration || '60')} onChange={(e) => c.onChangeGuideDuration && c.onChangeGuideDuration(e.target.value)}>
                <option value="30">30秒</option>
                <option value="60">1分钟</option>
                <option value="180">3分钟</option>
                <option value="1200">20分钟</option>
              </select>
            </label>
          ) : null}

          {c.guideEnabled ? (
            <label className="settings-toggle">
              <input type="checkbox" checked={!!c.continuousTour} onChange={(e) => c.onChangeContinuousTour && c.onChangeContinuousTour(e.target.checked)} />
              <span>连续讲解</span>
            </label>
          ) : null}

          {zones.length ? (
            <label className="settings-field">
              <span>讲解路线</span>
              <select value={String(c.tourZone || '')} onChange={(e) => c.onChangeTourZone && c.onChangeTourZone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

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

      <SettingsGroup title="站点控制">
        <div className="tour-controls">
          <select value={String(c.tourSelectedStopIndex || 0)} onChange={(e) => c.onChangeTourSelectedStopIndex && c.onChangeTourSelectedStopIndex(Number(e.target.value) || 0)}>
            {(Array.isArray(c.tourStops) && c.tourStops.length ? c.tourStops : ['第1站']).map((s, i) => (
              <option key={`${i}_${String(s)}`} value={String(i)}>
                {`第${i + 1}站 ${String(s || '').trim()}`}
              </option>
            ))}
          </select>
          <button type="button" className="tour-jump-btn" onClick={() => c.onJump && c.onJump()}>
            跳转
          </button>
          <button type="button" className="tour-reset-btn" onClick={() => c.onReset && c.onReset()}>
            重置
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="讲解模板">
        <TourModePanel {...(tourModePanelProps || {})} />
      </SettingsGroup>
    </>
  );
}

export function SettingsPanel({
  open,
  onClose,
  showHistoryPanel,
  onChangeShowHistoryPanel,
  showDebugPanel,
  onChangeShowDebugPanel,
  controlBarProps,
  stagePanelProps,
  tourModePanelProps,
  sellingPointsStopName,
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
  const [activeTab, setActiveTab] = useState('tts');

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
      return (
        <OpsTab
          controlBarProps={controlBarProps}
          stagePanelProps={stagePanelProps}
          onQuickSummary={onQuickSummary}
          onPrevStop={onPrevStop}
          onNextStop={onNextStop}
          sellingPointsStopName={sellingPointsStopName}
        />
      );
    }
    if (activeTab === 'archive') {
      return <ArchiveTab controlBarProps={controlBarProps} />;
    }
    if (activeTab === 'asr') {
      return <AsrTab controlBarProps={controlBarProps} />;
    }
    return <ModeTab controlBarProps={controlBarProps} tourModePanelProps={tourModePanelProps} />;
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
    sellingPointsStopName,
    tourModePanelProps,
  ]);

  return (
    <SettingsDrawer open={open} title="设置" onClose={onClose}>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="settings-tab-panel">{tabContent}</div>
    </SettingsDrawer>
  );
}
