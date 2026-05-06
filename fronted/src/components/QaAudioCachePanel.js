import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { backendUrl, fetchJson } from '../api/backendClient';

function normalizeSpeedInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return '';
  return String(n);
}

function buildQuery({ limit, speed }) {
  const params = new URLSearchParams();
  params.set('limit', String(limit || 100));
  if (String(speed || '').trim()) params.set('speed', normalizeSpeedInput(speed));
  return params.toString();
}

function resolveAudioUrl(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return backendUrl(text);
}

export function QaAudioCachePanel() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState('');

  const query = useMemo(() => buildQuery({ limit: 100, speed }), [speed]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`/api/ops/qa_audio_pairs?${query}`);
      if (data && data.ok === false) {
        throw new Error(String(data.error || 'qa_audio_cache_load_failed'));
      }
      if (!Array.isArray(data && data.items)) {
        throw new Error('qa_audio_cache_invalid_response');
      }
      const list = data.items;
      setItems(list);
      setErr('');
    } catch (e) {
      const msg = String((e && e.message) || e || 'load_failed');
      setErr(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDelete = async (id) => {
    const pairId = Number(id);
    if (!Number.isFinite(pairId) || pairId <= 0) return;
    const ok = window.confirm(`确认删除缓存条目 #${pairId} 吗？删除后不可恢复。`);
    if (!ok) return;
    try {
      await fetchJson(`/api/ops/qa_audio_pairs/${encodeURIComponent(String(pairId))}`, {
        method: 'DELETE',
      });
      setMessage('');
      await refresh();
    } catch (e) {
      const msg = String((e && e.message) || e || 'delete_failed');
      setErr(msg);
    }
  };

  const onCleanupInvalidAudio = async () => {
    const ok = window.confirm('确认清理“没有语音或语音时长为0”的问答缓存吗？');
    if (!ok) return;
    try {
      const data = await fetchJson('/api/ops/qa_audio_pairs/cleanup_invalid_audio', {
        method: 'POST',
      });
      const scanned = Number((data && data.scanned) || 0);
      const invalid = Number((data && data.invalid) || 0);
      const deleted = Number((data && data.deleted) || 0);
      setErr('');
      setMessage(`已清理 ${deleted} 条无效缓存（invalid=${invalid}, scanned=${scanned}）`);
      await refresh();
    } catch (e) {
      const msg = String((e && e.message) || e || 'cleanup_failed');
      setErr(msg);
    }
  };

  return (
    <div className="settings-block">
      {err ? <div style={{ color: '#b00020', fontSize: 12, marginBottom: 8 }}>{err}</div> : null}
      {message ? <div style={{ color: '#166534', fontSize: 12, marginBottom: 8 }}>{message}</div> : null}

      <div className="settings-form" style={{ marginBottom: 10 }}>
        <label className="settings-field">
          <span>speed</span>
          <input value={speed} onChange={(e) => setSpeed(e.target.value)} placeholder="1.0" />
        </label>
      </div>

      <div className="settings-actions" style={{ marginBottom: 10 }}>
        <button type="button" className="settings-action-btn" onClick={refresh} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </button>
        <button type="button" className="settings-action-btn settings-action-btn-danger" onClick={onCleanupInvalidAudio} disabled={loading}>
          清理无效语音
        </button>
      </div>

      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid rgba(0,0,0,0.08)', padding: 8 }}>
        {items.length ? (
          items.map((it) => {
            const id = Number(it && it.id);
            const q = String((it && it.question_text) || '');
            const a = String((it && it.answer_text) || '');
            const audioUrl = resolveAudioUrl((it && it.audio_url) || '');
            return (
              <div key={String(id)} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                  #{id} | speed: {String((it && it.tts_speed) || '')}
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>Q: {q}</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>A: {a}</div>
                {audioUrl ? <audio controls preload="metadata" src={audioUrl} style={{ width: '100%', marginBottom: 6 }} /> : null}
                <div className="settings-actions">
                  <button type="button" className="settings-action-btn" onClick={() => onDelete(id)}>
                    删除
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ fontSize: 12, opacity: 0.75 }}>{loading ? '加载中...' : '暂无缓存条目'}</div>
        )}
      </div>
    </div>
  );
}
