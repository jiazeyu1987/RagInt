import React, { useEffect, useMemo, useState } from 'react';
import { HistoryPanel } from './HistoryPanel';
import { DebugPanel } from './DebugPanel';

export function RightPanelTabs({
  showHistoryPanel,
  historySort,
  onChangeHistorySort,
  historyItems,
  onPickHistoryQuestion,
  showDebugPanel,
  debugInfo,
  qaCacheDebug,
  guideModeLabel,
  ttsEnabled,
  tourState,
  serverStatus,
  serverStatusErr,
  serverEvents,
  serverEventsErr,
  serverLastError,
  questionQueue,
  onAnswerQueuedNow,
  onRemoveQueuedQuestion,
}) {
  const rightTabs = useMemo(() => {
    const out = [];
    if (showHistoryPanel) out.push({ key: 'history', label: '历史' });
    if (showDebugPanel) out.push({ key: 'debug', label: '调试' });
    return out;
  }, [showDebugPanel, showHistoryPanel]);

  const [activeRightTab, setActiveRightTab] = useState('history');

  useEffect(() => {
    if (!rightTabs.length) return;
    if (!rightTabs.find((t) => t.key === activeRightTab)) {
      setActiveRightTab(rightTabs[0].key);
    }
  }, [activeRightTab, rightTabs]);

  return (
    <aside className="right-panel">
      {rightTabs.length > 1 ? (
        <div className="right-panel-tabs" role="tablist" aria-label="右侧面板">
          {rightTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeRightTab === tab.key}
              className={`right-panel-tab-btn${activeRightTab === tab.key ? ' is-active' : ''}`}
              onClick={() => setActiveRightTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="right-panel-body">
        {!rightTabs.length ? <div className="debug-muted">右侧面板已关闭，请在 Debug 设置中开启。</div> : null}

        {activeRightTab === 'history' && showHistoryPanel ? (
          <HistoryPanel
            embedded
            historySort={historySort}
            onChangeSort={onChangeHistorySort}
            items={historyItems}
            onPickQuestion={onPickHistoryQuestion}
          />
        ) : null}

        {activeRightTab === 'debug' && showDebugPanel ? (
          <DebugPanel
            embedded
            debugInfo={debugInfo}
            qaCacheDebug={qaCacheDebug}
            guideModeLabel={guideModeLabel}
            ttsEnabled={ttsEnabled}
            tourState={tourState}
            serverStatus={serverStatus}
            serverStatusErr={serverStatusErr}
            serverEvents={serverEvents}
            serverEventsErr={serverEventsErr}
            serverLastError={serverLastError}
            questionQueue={questionQueue}
            onAnswerQueuedNow={onAnswerQueuedNow}
            onRemoveQueuedQuestion={onRemoveQueuedQuestion}
          />
        ) : null}
      </div>
    </aside>
  );
}
