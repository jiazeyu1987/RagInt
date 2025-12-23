import React from 'react';

export function ChatPanel({ lastQuestion, answer, isLoading, queueStatus, messagesEndRef }) {
  return (
    <div className="main">
      {lastQuestion ? (
        <div className="question-section">
          <h3>问题: {lastQuestion}</h3>
        </div>
      ) : null}

      {answer ? (
        <div className="answer-section">
          <h3>回答:</h3>
          <p>{answer}</p>
        </div>
      ) : null}

      {isLoading ? <div className="loading">处理中...</div> : null}

      {queueStatus ? (
        <div className="queue-status">
          <small>{queueStatus}</small>
        </div>
      ) : null}

      <div ref={messagesEndRef} />
    </div>
  );
}

