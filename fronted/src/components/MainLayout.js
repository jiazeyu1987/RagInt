import React from 'react';
import { ChatPanel } from './ChatPanel';

export function MainLayout({
  lastQuestion,
  answer,
  answerCacheMeta,
  qaCacheDebug,
  isLoading,
  queueStatus,
  messagesEndRef,
}) {
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
    </div>
  );
}
