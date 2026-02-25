import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { backendUrl, fetchJson } from '../api/backendClient';

function normalizeSpeedInput(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  return String(n);
}

function buildQuery({ limit, provider, voice, speed }) {
  const params = new URLSearchParams();
  params.set('limit', String(limit || 100));
  if (String(provider || '').trim()) params.set('provider', String(provider).trim());
  if (String(voice || '').trim()) params.set('voice', String(voice).trim());
  if (String(speed || '').trim()) params.set('speed', normalizeSpeedInput(speed));
  return params.toString();
}

function resolveAudioUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return backendUrl(s);
}

export function QaAudioCachePanel() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('');
  const [voice, setVoice] = useState('');
  const [speed, setSpeed] = useState('');

  const query = useMemo(() => buildQuery({ limit: 100, provider, voice, speed }), [provider, voice, speed]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`/api/ops/qa_audio_pairs?${query}`);
      const list = Array.isArray(data && data.items) ? data.items : [];
      setItems(list);
      setErr('');
    } catch (e) {
      setErr(String((e && e.message) || e || 'load_failed'));
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
      await fetchJson(`/api/ops/qa_audio_pairs/${encodeURIComponent(String(pairId))}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      setErr(String((e && e.message) || e || 'delete_failed'));
    }
  };

  return (
    <div className="settings-block">
      {err ? <div style={{ color: '#b00020', fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

      <div className="settings-form" style={{ marginBottom: 10 }}>
        <label className="settings-field">
          <span>provider</span>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="edge / modelscope" />
        </label>
        <label className="settings-field">
          <span>voice</span>
          <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="voice id" />
        </label>
        <label className="settings-field">
          <span>speed</span>
          <input value={speed} onChange={(e) => setSpeed(e.target.value)} placeholder="1.0" />
        </label>
      </div>

      <div className="settings-actions" style={{ marginBottom: 10 }}>
        <button type="button" className="settings-action-btn" onClick={refresh} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
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
                  #{id} | {String((it && it.tts_provider) || '')} / {String((it && it.tts_voice) || '')} / {String((it && it.tts_speed) || '')}
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
