import React, { useEffect, useMemo, useState } from 'react';
import { deleteSellingPoint, listSellingPoints, upsertSellingPoint } from '../api/sellingPoints';

export function SellingPointsPanel({ stopName, hideTitle } = {}) {
  const sn = String(stopName || '').trim();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [weight, setWeight] = useState(10);

  const canEdit = !!sn;
  const title = useMemo(() => (sn ? `卖点库：${sn}` : '卖点库：请先选择站点'), [sn]);

  const refresh = async () => {
    if (!sn) {
      setItems([]);
      return;
    }
    try {
      const res = await listSellingPoints({ stopName: sn, limit: 50 });
      setItems(Array.isArray(res && res.items) ? res.items : []);
      setErr('');
    } catch (e) {
      setErr(String((e && e.message) || e || 'fetch_failed'));
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sn]);

  return (
    <div className="settings-block">
      {hideTitle ? null : (
        <div className="settings-title" style={{ fontWeight: 600, marginBottom: 8 }}>
          {title}
        </div>
      )}

      {err ? <div style={{ color: '#b00020', fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input disabled={!canEdit} value={text} onChange={(e) => setText(e.target.value)} placeholder="卖点文本（例如：核心优势/亮点）" style={{ flex: 1, minWidth: 240 }} />
        <input disabled={!canEdit} value={String(weight)} onChange={(e) => setWeight(Number(e.target.value) || 0)} placeholder="权重" style={{ width: 100 }} />
        <button
          type="button"
          disabled={!canEdit || !String(text || '').trim()}
          onClick={async () => {
            const t = String(text || '').trim();
            if (!t) return;
            await upsertSellingPoint({ stopName: sn, text: t, weight });
            setText('');
            await refresh();
          }}
        >
          添加/更新
        </button>
        <button type="button" disabled={!canEdit} onClick={refresh}>
          刷新
        </button>
      </div>

      <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid rgba(0,0,0,0.08)', padding: 8 }}>
        {(items || []).length ? (
          (items || []).map((it) => (
            <div key={`${String(it.text)}_${String(it.weight)}`} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{String(it.text || '')}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>weight={String(it.weight)}</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await deleteSellingPoint({ stopName: sn, text: String(it.text || '') });
                  await refresh();
                }}
              >
                删除
              </button>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, opacity: 0.75 }}>暂无卖点</div>
        )}
      </div>
    </div>
  );
}
