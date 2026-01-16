import React from 'react';
import { SettingsDrawer } from './SettingsDrawer';
import { SettingsToggles } from './SettingsToggles';
import { ControlBar } from './ControlBar';
import { StagePanel } from './StagePanel';
import { TourModePanel } from './TourModePanel';
import { SellingPointsPanel } from './SellingPointsPanel';

function SettingsGroup({ title, children }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">{title}</div>
      <div className="settings-group-body">{children}</div>
    </div>
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
  const spn = String(sellingPointsStopName || '').trim();
  const sellingPointsTitle = spn ? `卖点库：${spn}` : '卖点库';

  return (
    <SettingsDrawer open={open} title="设置" onClose={onClose}>
      <SettingsGroup title="显示">
        <SettingsToggles
          showHistoryPanel={showHistoryPanel}
          onChangeShowHistoryPanel={onChangeShowHistoryPanel}
          showDebugPanel={showDebugPanel}
          onChangeShowDebugPanel={onChangeShowDebugPanel}
        />
      </SettingsGroup>

      <SettingsGroup title="运行">
        <ControlBar {...(controlBarProps || {})} />
      </SettingsGroup>

      <SettingsGroup title="控场">
        <StagePanel {...(stagePanelProps || {})} />
      </SettingsGroup>

      <SettingsGroup title="讲解模式">
        <TourModePanel {...(tourModePanelProps || {})} />
      </SettingsGroup>

      <SettingsGroup title={sellingPointsTitle}>
        <SellingPointsPanel stopName={sellingPointsStopName} hideTitle />
      </SettingsGroup>

      {ttsMode === 'modelscope' ? (
        <SettingsGroup title="语音">
          <div className="settings-form">
            <label className="settings-field">
              <span>ModelScope 音色(voice id)</span>
              <input
                value={modelscopeVoice}
                onChange={(e) => onChangeModelscopeVoice(e.target.value)}
                placeholder="例如：cosyvoice-v3-plus-xxxx / cosyvoice-v3-plus-myvoice-..."
              />
            </label>
          </div>
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="快捷操作">
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
    </SettingsDrawer>
  );
}

