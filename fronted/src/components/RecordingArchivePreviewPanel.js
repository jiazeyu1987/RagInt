import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { backendUrl, fetchJson } from '../api/backendClient';

function normalizeStops(stops) {
  return Array.isArray(stops) ? stops.map((s) => String(s || '').trim()).filter(Boolean) : [];
}

function segmentKey(seg, fallbackKey) {
  if (Number.isFinite(Number(seg && seg.segment_id))) return `seg_${Number(seg.segment_id)}`;
  return String(fallbackKey || '');
}

function resolveAudioUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return backendUrl(s);
}

export function RecordingArchivePreviewPanel({ recordingId, ttsProvider, ttsVoice, ttsSpeed } = {}) {
  const rid = String(recordingId || '').trim();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState([]);
  const [draftTextByKey, setDraftTextByKey] = useState({});
  const [regenLoadingByKey, setRegenLoadingByKey] = useState({});
  const [regenErrByKey, setRegenErrByKey] = useState({});

  const refresh = useCallback(async () => {
    if (!rid) {
      setItems([]);
      setErr('');
      setDraftTextByKey({});
      setRegenErrByKey({});
      setRegenLoadingByKey({});
      return;
    }
    setLoading(true);
    try {
      const meta = await fetchJson(`/api/recordings/${encodeURIComponent(rid)}`);
      const stops = normalizeStops(meta && meta.stops);
      const tasks = stops.map((_, idx) =>
        fetchJson(`/api/recordings/${encodeURIComponent(rid)}/stop/${encodeURIComponent(String(idx))}`)
          .then((payload) => ({ payload, idx }))
          .catch(() => ({ payload: null, idx }))
      );
      const settled = await Promise.all(tasks);
      const list = settled
        .map(({ payload, idx }) => {
          if (!payload || typeof payload !== 'object') return null;
          const stopName = String(payload.stop_name || stops[idx] || '').trim();
          const answerText = String(payload.answer_text || '').trim();
          const segments = Array.isArray(payload.segments)
            ? payload.segments.map((seg, segIdx) => {
                const fallbackKey = `${idx}_${segIdx}`;
                  return {
                    key: segmentKey(seg, fallbackKey),
                    segment_id: Number.isFinite(Number(seg && seg.segment_id)) ? Number(seg.segment_id) : null,
                    segment_index: Number.isFinite(Number(seg && seg.segment_index)) ? Number(seg.segment_index) : null,
                    seq: Number.isFinite(Number(seg && seg.seq)) ? Number(seg.seq) : segIdx,
                    text: String((seg && seg.text) || '').trim(),
                    audio_url: resolveAudioUrl((seg && seg.audio_url) || ''),
                  };
                })
            : [];
          return {
            stop_index: Number.isFinite(Number(payload.stop_index)) ? Number(payload.stop_index) : idx,
            stop_name: stopName || `第${idx + 1}站`,
            answer_text: answerText,
            segments,
          };
        })
        .filter(Boolean);

      const nextDraftMap = {};
      list.forEach((it) => {
        (it.segments || []).forEach((seg) => {
          nextDraftMap[String(seg.key)] = String(seg.text || '');
        });
      });
      setDraftTextByKey((prev) => ({ ...nextDraftMap, ...(prev || {}) }));
      setItems(list);
      setErr('');
    } catch (e) {
      setErr(String((e && e.message) || e || 'load_archive_preview_failed'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalSegments = useMemo(
    () => items.reduce((sum, it) => sum + (Array.isArray(it.segments) ? it.segments.length : 0), 0),
    [items]
  );

  const onChangeSegmentText = useCallback((key, value) => {
    const k = String(key || '');
    setDraftTextByKey((prev) => ({ ...(prev || {}), [k]: String(value || '') }));
  }, []);

  const regenerateSegment = useCallback(
    async (seg) => {
      const segId = Number(seg && seg.segment_id);
      const key = String((seg && seg.key) || '');
      if (!rid || !Number.isFinite(segId) || !key) return;

      const text = String((draftTextByKey && draftTextByKey[key]) || '').trim();
      if (!text) {
        setRegenErrByKey((prev) => ({ ...(prev || {}), [key]: '文本不能为空' }));
        return;
      }

      setRegenLoadingByKey((prev) => ({ ...(prev || {}), [key]: true }));
      setRegenErrByKey((prev) => ({ ...(prev || {}), [key]: '' }));
      try {
        const speedNum = Number(ttsSpeed);
        const payload = {
          text,
          tts_provider: String(ttsProvider || '').trim(),
          tts_voice: String(ttsVoice || '').trim(),
          tts_speed: Number.isFinite(speedNum) ? speedNum : 1.0,
        };
        const data = await fetchJson(
          `/api/recordings/${encodeURIComponent(rid)}/segment/${encodeURIComponent(String(segId))}/regenerate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const outSeg = data && data.segment && typeof data.segment === 'object' ? data.segment : null;
        if (!outSeg) throw new Error('regenerate_failed');
        setItems((prevItems) =>
          (Array.isArray(prevItems) ? prevItems : []).map((it) => ({
            ...it,
            segments: (Array.isArray(it.segments) ? it.segments : []).map((s) => {
              if (Number.isFinite(Number(s.segment_id)) && Number(s.segment_id) === Number(outSeg.segment_id)) {
                return {
                  ...s,
                  text: String(outSeg.text || ''),
                  audio_url: resolveAudioUrl(outSeg.audio_url || ''),
                };
              }
              return s;
            }),
          }))
        );
        setDraftTextByKey((prev) => ({ ...(prev || {}), [key]: String(outSeg.text || text) }));
      } catch (e) {
        setRegenErrByKey((prev) => ({ ...(prev || {}), [key]: String((e && e.message) || e || 'regenerate_failed') }));
      } finally {
        setRegenLoadingByKey((prev) => ({ ...(prev || {}), [key]: false }));
      }
    },
    [draftTextByKey, rid, ttsProvider, ttsSpeed, ttsVoice]
  );

  if (!rid) {
    return <div style={{ fontSize: 12, opacity: 0.75 }}>请选择存档后查看文字与语音内容。</div>;
  }

  return (
    <div className="settings-block">
      {err ? <div style={{ color: '#b00020', fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

      <div className="settings-actions" style={{ marginBottom: 10 }}>
        <button type="button" className="settings-action-btn" onClick={refresh} disabled={loading}>
          {loading ? '加载中...' : '刷新预览'}
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>站点数：{items.length}，语音段数：{totalSegments}</div>

      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid rgba(0,0,0,0.08)', padding: 8 }}>
        {items.length ? (
          items.map((it) => (
            <div
              key={`stop_${String(it.stop_index)}_${it.stop_name}`}
              style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 8, marginBottom: 8 }}
            >
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                第{Number(it.stop_index) + 1}站 | {String(it.stop_name)}
              </div>
              <div style={{ fontSize: 13, marginBottom: 6, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                {it.answer_text || '（该站点暂无完整文本）'}
              </div>
              {Array.isArray(it.segments) && it.segments.length ? (
                it.segments.map((seg, idx) => {
                  const k = String(seg.key);
                  const textValue = String(
                    Object.prototype.hasOwnProperty.call(draftTextByKey || {}, k) ? draftTextByKey[k] : seg.text || ''
                  );
                  const regenBusy = !!regenLoadingByKey[k];
                  const regenErr = String((regenErrByKey && regenErrByKey[k]) || '');
                  const canRegen = Number.isFinite(Number(seg.segment_id));
                  return (
                    <div key={k} style={{ marginBottom: 10, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: 8 }}>
                      <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>段落 {idx + 1}</div>
                      <textarea
                        value={textValue}
                        onChange={(e) => onChangeSegmentText(k, e.target.value)}
                        rows={3}
                        style={{ width: '100%', resize: 'vertical', marginBottom: 6 }}
                        placeholder="可编辑本段文本，点击重新生成语音后生效"
                      />
                      {seg.audio_url ? <audio controls preload="metadata" src={seg.audio_url} style={{ width: '100%' }} /> : null}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <button type="button" className="settings-action-btn" disabled={regenBusy || !canRegen} onClick={() => regenerateSegment(seg)}>
                          {regenBusy ? '重新生成中...' : '重新生成语音'}
                        </button>
                      </div>
                      {regenErr ? <div style={{ color: '#b00020', fontSize: 12, marginTop: 4 }}>{regenErr}</div> : null}
                      {!canRegen ? <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>当前段落缺少 segment_id，无法重生成</div> : null}
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 12, opacity: 0.75 }}>（该站点暂无语音段）</div>
              )}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, opacity: 0.75 }}>{loading ? '加载中...' : '该存档暂时无可预览内容。'}</div>
        )}
      </div>
    </div>
  );
}
