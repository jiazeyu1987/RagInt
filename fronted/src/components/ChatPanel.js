import React from 'react';

export function ChatPanel({ lastQuestion, answer, answerCacheMeta, qaCacheDebug, isLoading, queueStatus, messagesEndRef }) {
  const cacheHit = !!(answerCacheMeta && answerCacheMeta.hit);
  const cacheType = String((answerCacheMeta && answerCacheMeta.type) || '').trim();
  const answerCls = cacheHit ? 'answer-section answer-section-cache-hit' : 'answer-section';

  const debugObj = qaCacheDebug && typeof qaCacheDebug === 'object' ? qaCacheDebug : {};
  const debugReason = String(debugObj.reason || '').trim();
  const pairIdRaw = [debugObj.pair_id, debugObj.candidate_id, debugObj.display_pair_id, debugObj.best_pair_id].find((v) =>
    Number.isFinite(Number(v))
  );
  const confidenceRaw = [debugObj.confidence, debugObj.classifier_confidence, debugObj.display_confidence].find((v) =>
    Number.isFinite(Number(v))
  );
  const pairIdText = Number.isFinite(Number(pairIdRaw)) ? String(Number(pairIdRaw)) : '-';
  const confidenceText = Number.isFinite(Number(confidenceRaw)) ? Number(confidenceRaw).toFixed(3) : '-';

  let cacheLabel = '（命中缓存）';
  if (cacheType === 'qa_audio') cacheLabel = '（命中语音缓存）';
  if (cacheType === 'qa_text') cacheLabel = '（命中文本缓存）';

  return (
    <div className="main">
      {lastQuestion ? (
        <div className="question-section">
          <h3>问题: {lastQuestion}</h3>
        </div>
      ) : null}

      {answer ? (
        <div className={answerCls}>
          <h3>
            回答:
            {cacheHit ? <span className="answer-cache-badge">{cacheLabel}</span> : null}
          </h3>
          <p>{answer}</p>
          <div className="cache-debug-metrics">
            缓存置信度: {confidenceText} | 对应问题ID: {pairIdText}
          </div>
          {!cacheHit && debugReason ? <div className="cache-debug-hint">缓存未命中原因: {debugReason}</div> : null}
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

