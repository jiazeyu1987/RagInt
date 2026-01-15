import React from 'react';
import { SettingsDrawer } from './SettingsDrawer';
import { SettingsToggles } from './SettingsToggles';
import { ControlBar } from './ControlBar';
import { StagePanel } from './StagePanel';
import { TourModePanel } from './TourModePanel';
import { SellingPointsPanel } from './SellingPointsPanel';

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
  return (
    <SettingsDrawer open={open} title="设置" onClose={onClose}>
      <SettingsToggles
        showHistoryPanel={showHistoryPanel}
        onChangeShowHistoryPanel={onChangeShowHistoryPanel}
        showDebugPanel={showDebugPanel}
        onChangeShowDebugPanel={onChangeShowDebugPanel}
      />

      <div className="settings-divider" />

      <ControlBar {...(controlBarProps || {})} />

      <div className="settings-divider" />

      <StagePanel {...(stagePanelProps || {})} />

      <div className="settings-divider" />

      <TourModePanel {...(tourModePanelProps || {})} />

      <div className="settings-divider" />
      <SellingPointsPanel stopName={sellingPointsStopName} />

      {ttsMode === 'modelscope' ? (
        <>
          <div className="settings-divider" />
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
        </>
      ) : null}

      {groupMode ? (
        <>
          <div className="settings-divider" />
          <div className="settings-form">
            <label className="settings-field">
              <span>提问人</span>
              <input value={speakerName} onChange={(e) => onChangeSpeakerName(e.target.value)} placeholder="观众A" />
            </label>
            <label className="settings-field">
              <span>优先级</span>
              <select value={questionPriority} onChange={(e) => onChangeQuestionPriority(e.target.value)}>
                <option value="normal">普通</option>
                <option value="high">高优先</option>
              </select>
            </label>
          </div>
        </>
      ) : null}

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
    </SettingsDrawer>
  );
}

