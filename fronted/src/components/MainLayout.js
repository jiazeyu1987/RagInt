import React, { useEffect, useMemo, useState } from 'react';
import { HistoryPanel } from './HistoryPanel';
import { DebugPanel } from './DebugPanel';
import { ChatPanel } from './ChatPanel';

export function MainLayout({
  showHistoryPanel,
  historySort,
  onChangeHistorySort,
  historyItems,
  onPickHistoryQuestion,
  lastQuestion,
  answer,
  answerCacheMeta,
  qaCacheDebug,
  isLoading,
  queueStatus,
  messagesEndRef,
  showDebugPanel,
  debugInfo,
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
    <div className="layout">
      <ChatPanel
        lastQuestion={lastQuestion}
        answer={answer}
        answerCacheMeta={answerCacheMeta}
        qaCacheDebug={qaCacheDebug}
        isLoading={isLoading}
        queueStatus={queueStatus}
        messagesEndRef={messagesEndRef}
      />

      {rightTabs.length ? (
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
      ) : null}
    </div>
  );
}
