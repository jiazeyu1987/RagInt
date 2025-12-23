import React from 'react';

export function DebugPanel({
  debugInfo,
  ttsEnabled,
  questionQueue,
  onAnswerQueuedNow,
  onRemoveQueuedQuestion,
}) {
  const q = Array.isArray(questionQueue) ? questionQueue : [];
  return (
    <aside className="debug-panel">
      <div className="debug-title">调试面板</div>
      {!debugInfo ? (
        <div className="debug-muted">点击发送后显示耗时</div>
      ) : (
        <>
          <div className="debug-row">
            <div className="debug-k">触发</div>
            <div className="debug-v">{debugInfo.trigger}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">提交 → 首字</div>
            <div className="debug-v">
              {debugInfo.ragflowFirstChunkAt ? `${(debugInfo.ragflowFirstChunkAt - debugInfo.submitAt).toFixed(0)} ms` : '—'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">提交 → 首段</div>
            <div className="debug-v">
              {debugInfo.ragflowFirstSegmentAt ? `${(debugInfo.ragflowFirstSegmentAt - debugInfo.submitAt).toFixed(0)} ms` : '—'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">提交 → TTS首包</div>
            <div className="debug-v">
              {debugInfo.ttsFirstAudioAt ? `${(debugInfo.ttsFirstAudioAt - debugInfo.submitAt).toFixed(0)} ms` : ttsEnabled ? '—' : '已关闭'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">提交 → RAG结束</div>
            <div className="debug-v">
              {debugInfo.ragflowDoneAt ? `${(debugInfo.ragflowDoneAt - debugInfo.submitAt).toFixed(0)} ms` : '—'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">提交 → TTS结束</div>
            <div className="debug-v">
              {debugInfo.ttsAllDoneAt ? `${(debugInfo.ttsAllDoneAt - debugInfo.submitAt).toFixed(0)} ms` : ttsEnabled ? '—' : '已关闭'}
            </div>
          </div>

          <div className="debug-subtitle">围观队列</div>
          <div className="debug-list">
            {!q.length ? (
              <div className="debug-muted">无排队问题</div>
            ) : (
              q.slice(0, 12).map((item) => (
                <div key={item.id} className="debug-item">
                  <div className="debug-item-h">
                    <span>{item.speaker || '观众'}</span>
                    <span>{item.priority === 'high' ? '高优先' : '普通'}</span>
                  </div>
                  <div className="debug-item-b">
                    <div className="queue-q">{String(item.text || '').slice(0, 60)}</div>
                    <div className="queue-actions">
                      <button type="button" className="queue-btn" onClick={() => onAnswerQueuedNow && onAnswerQueuedNow(item)}>
                        立即回答
                      </button>
                      <button
                        type="button"
                        className="queue-btn queue-btn-danger"
                        onClick={() => onRemoveQueuedQuestion && onRemoveQueuedQuestion(item.id)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="debug-subtitle">分段</div>
          <div className="debug-list">
            {(debugInfo.segments || []).slice(-12).map((s) => (
              <div key={s.seq} className="debug-item">
                <div className="debug-item-h">
                  <span>#{s.seq}</span>
                  <span>{s.chars}字</span>
                </div>
                <div className="debug-item-b">
                  <div>请求: {s.ttsRequestAt ? `${(s.ttsRequestAt - debugInfo.submitAt).toFixed(0)}ms` : '—'}</div>
                  <div>首包: {s.ttsFirstAudioAt ? `${(s.ttsFirstAudioAt - debugInfo.submitAt).toFixed(0)}ms` : '—'}</div>
                  <div>结束: {s.ttsDoneAt ? `${(s.ttsDoneAt - debugInfo.submitAt).toFixed(0)}ms` : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

