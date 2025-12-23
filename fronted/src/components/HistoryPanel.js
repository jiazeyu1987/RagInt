import React from 'react';

export function HistoryPanel({ historySort, onChangeSort, items, onPickQuestion }) {
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <aside className="history-panel">
      <div className="history-title">
        <span>历史</span>
        <select value={historySort} onChange={(e) => onChangeSort && onChangeSort(e.target.value)}>
          <option value="time">按时间</option>
          <option value="count">按次数</option>
        </select>
      </div>
      <div className="history-list">
        {safeItems.slice(0, 200).map((item, idx) => {
          const q = String((item && item.question) || '').trim();
          if (!q) return null;
          const cnt = item && item.cnt != null ? Number(item.cnt) : null;
          const meta = cnt != null ? `${cnt}次` : '';
          const key = item && item.id != null ? `id_${item.id}` : `q_${idx}_${q}`;
          return (
            <button
              key={key}
              type="button"
              className="history-item"
              onClick={() => onPickQuestion && onPickQuestion(q)}
              title={q}
            >
              <div className="history-row">
                <div className="history-q">{q}</div>
                {meta ? <div className="history-count">{meta}</div> : null}
              </div>
            </button>
          );
        })}
        {!safeItems.length ? <div className="history-empty">暂无历史</div> : null}
      </div>
    </aside>
  );
}

