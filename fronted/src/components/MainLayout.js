import React from 'react';
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
  return (
    <div className="layout">
      {showHistoryPanel ? (
        <HistoryPanel
          historySort={historySort}
          onChangeSort={onChangeHistorySort}
          items={historyItems}
          onPickQuestion={onPickHistoryQuestion}
        />
      ) : null}

      <ChatPanel lastQuestion={lastQuestion} answer={answer} isLoading={isLoading} queueStatus={queueStatus} messagesEndRef={messagesEndRef} />

      {showDebugPanel ? (
        <DebugPanel
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
  );
}

