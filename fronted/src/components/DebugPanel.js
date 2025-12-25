import React, { useState } from 'react';
import { backendUrl } from '../api/backendClient';

export function DebugPanel({
  debugInfo,
  ttsEnabled,
  tourState,
  clientId,
  serverStatus,
  serverStatusErr,
  serverEvents,
  serverEventsErr,
  serverLastError,
  questionQueue,
  onAnswerQueuedNow,
  onRemoveQueuedQuestion,
}) {
  const q = Array.isArray(questionQueue) ? questionQueue : [];
  const requestId = debugInfo && debugInfo.requestId ? String(debugInfo.requestId) : '';
  const events = Array.isArray(serverEvents) ? serverEvents : [];
  const lastErr = serverLastError || null;
  const tour = tourState && typeof tourState === 'object' ? tourState : null;
  const tourStopName = tour && tour.stopName ? String(tour.stopName) : '';
  const tourStopIndex = tour && Number.isFinite(Number(tour.stopIndex)) ? Number(tour.stopIndex) : null;
  const tourMode = tour && tour.mode ? String(tour.mode) : '';
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState('');
  const [diagData, setDiagData] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgErr, setCfgErr] = useState('');
  const [cfgOk, setCfgOk] = useState('');
  const [cfgBackups, setCfgBackups] = useState([]);

  const runDiag = async () => {
    setDiagErr('');
    setDiagLoading(true);
    try {
      const headers = {};
      if (clientId) headers['X-Client-ID'] = String(clientId);
      const r = await fetch(backendUrl('/api/diag'), { headers });
      const j = await r.json();
      setDiagData(j);
    } catch (e) {
      setDiagData(null);
      setDiagErr(String((e && e.message) || e || 'diag_failed'));
    } finally {
      setDiagLoading(false);
    }

    try {
      const out = {
        permission: null,
        devices: [],
      };
      if (navigator && navigator.permissions && navigator.permissions.query) {
        try {
          const p = await navigator.permissions.query({ name: 'microphone' });
          out.permission = p && p.state ? String(p.state) : null;
        } catch (_) {
          out.permission = null;
        }
      }
      if (navigator && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        out.devices = Array.isArray(devices)
          ? devices.map((d) => ({ kind: d.kind, deviceId: d.deviceId, label: d.label, groupId: d.groupId }))
          : [];
      }
      setDeviceInfo(out);
    } catch (_) {
      setDeviceInfo({ permission: null, devices: [] });
    }
  };

  const downloadJson = (obj, filename) => {
    try {
      const text = JSON.stringify(obj, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'config.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {
      // ignore
    }
  };

  const refreshBackups = async () => {
    setCfgErr('');
    setCfgOk('');
    setCfgLoading(true);
    try {
      const headers = {};
      if (clientId) headers['X-Client-ID'] = String(clientId);
      const r = await fetch(backendUrl('/api/config/backups?limit=30'), { headers });
      const j = await r.json();
      setCfgBackups(Array.isArray(j && j.items) ? j.items : []);
    } catch (e) {
      setCfgBackups([]);
      setCfgErr(String((e && e.message) || e || 'config_backups_failed'));
    } finally {
      setCfgLoading(false);
    }
  };

  const exportConfig = async () => {
    setCfgErr('');
    setCfgOk('');
    setCfgLoading(true);
    try {
      const headers = {};
      if (clientId) headers['X-Client-ID'] = String(clientId);
      const r = await fetch(backendUrl('/api/config/export'), { headers });
      const j = await r.json();
      if (!j || j.ok !== true) throw new Error((j && j.error) || 'config_export_failed');
      downloadJson(j.config || {}, `ragint_config_export_${Date.now()}.json`);
      setCfgOk('已导出（已去除密钥）');
    } catch (e) {
      setCfgErr(String((e && e.message) || e || 'config_export_failed'));
    } finally {
      setCfgLoading(false);
    }
  };

  const importConfigFile = async (file) => {
    if (!file) return;
    setCfgErr('');
    setCfgOk('');
    setCfgLoading(true);
    try {
      const text = await file.text();
      const cfg = JSON.parse(text);
      const headers = { 'Content-Type': 'application/json' };
      if (clientId) headers['X-Client-ID'] = String(clientId);
      const r = await fetch(backendUrl('/api/config/import'), { method: 'POST', headers, body: JSON.stringify({ config: cfg }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || j.ok !== true) throw new Error((j && (j.error || (j.detail && j.detail.errors && j.detail.errors[0]))) || 'config_import_failed');
      setCfgOk(`已导入（已自动备份：${j.backup || '—'}）`);
      await refreshBackups();
    } catch (e) {
      setCfgErr(String((e && e.message) || e || 'config_import_failed'));
    } finally {
      setCfgLoading(false);
    }
  };

  const restoreBackup = async (name) => {
    const n = String(name || '').trim();
    if (!n) return;
    setCfgErr('');
    setCfgOk('');
    setCfgLoading(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (clientId) headers['X-Client-ID'] = String(clientId);
      const r = await fetch(backendUrl('/api/config/restore'), { method: 'POST', headers, body: JSON.stringify({ name: n }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || j.ok !== true) throw new Error((j && j.error) || 'config_restore_failed');
      setCfgOk(`已恢复：${n}（已备份当前：${j.backup || '—'}）`);
      await refreshBackups();
    } catch (e) {
      setCfgErr(String((e && e.message) || e || 'config_restore_failed'));
    } finally {
      setCfgLoading(false);
    }
  };
  let navState = '—';
  try {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (!e || e.kind !== 'nav') continue;
      navState = String(e.name || 'nav');
      break;
    }
  } catch (_) {
    // ignore
  }
  return (
    <aside className="debug-panel">
      <div className="debug-title">调试面板</div>
      {!debugInfo ? (
        <div className="debug-muted">点击发送后显示耗时</div>
      ) : (
        <>
          <div className="debug-subtitle">讲解/移动</div>
          <div className="debug-row">
            <div className="debug-k">当前站点</div>
            <div className="debug-v">{tourStopName ? `${tourStopIndex != null ? `#${tourStopIndex} ` : ''}${tourStopName}` : '—'}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">移动状态</div>
            <div className="debug-v">{navState}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">tour_mode</div>
            <div className="debug-v">{tourMode || '—'}</div>
          </div>

          <div className="debug-row">
            <div className="debug-k">request_id</div>
            <div className="debug-v">{requestId || '—'}</div>
          </div>
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

          <div className="debug-subtitle">后端状态</div>
          {!requestId ? (
            <div className="debug-muted">等待 request_id…</div>
          ) : serverStatusErr ? (
            <div className="debug-muted">{serverStatusErr}</div>
          ) : !serverStatus ? (
            <div className="debug-muted">查询中…</div>
          ) : (
            <>
              <div className="debug-row">
                <div className="debug-k">取消</div>
                <div className="debug-v">{serverStatus.cancelled ? '是' : '否'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit→rag首chunk</div>
                <div className="debug-v">{serverStatus.derived_ms && serverStatus.derived_ms.submit_to_rag_first_chunk_ms != null ? `${serverStatus.derived_ms.submit_to_rag_first_chunk_ms} ms` : '—'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit→rag首字</div>
                <div className="debug-v">{serverStatus.derived_ms && serverStatus.derived_ms.submit_to_rag_first_text_ms != null ? `${serverStatus.derived_ms.submit_to_rag_first_text_ms} ms` : '—'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit→首段</div>
                <div className="debug-v">{serverStatus.derived_ms && serverStatus.derived_ms.submit_to_first_segment_ms != null ? `${serverStatus.derived_ms.submit_to_first_segment_ms} ms` : '—'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">tts_seen</div>
                <div className="debug-v">{serverStatus.tts_state && serverStatus.tts_state.count != null ? `${serverStatus.tts_state.count}` : '—'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit→tts首包</div>
                <div className="debug-v">{serverStatus.derived_ms && serverStatus.derived_ms.submit_to_tts_first_audio_ms != null ? `${serverStatus.derived_ms.submit_to_tts_first_audio_ms} ms` : '—'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit→播报结束</div>
                <div className="debug-v">{serverStatus.derived_ms && serverStatus.derived_ms.submit_to_play_end_ms != null ? `${serverStatus.derived_ms.submit_to_play_end_ms} ms` : '—'}</div>
              </div>
              {serverStatus.last_error ? (
                <div className="debug-row">
                  <div className="debug-k">失败原因</div>
                  <div className="debug-v">
                    {`${(serverStatus.last_error.kind || 'error')}:${(serverStatus.last_error.name || 'error')}`}
                  </div>
                </div>
              ) : null}
            </>
          )}

          <div className="debug-subtitle">事件时间线</div>
          {!requestId ? (
            <div className="debug-muted">等待 request_id…</div>
          ) : serverEventsErr ? (
            <div className="debug-muted">{serverEventsErr}</div>
          ) : !serverEvents ? (
            <div className="debug-muted">查询中…</div>
          ) : (
            <>
              {lastErr ? (
                <div className="debug-row">
                  <div className="debug-k">最近错误</div>
                  <div className="debug-v">{`${lastErr.name || 'error'} ${(lastErr.fields && lastErr.fields.err) ? String(lastErr.fields.err).slice(0, 80) : ''}`}</div>
                </div>
              ) : null}
              <div className="debug-row">
                <div className="debug-k">导出</div>
                <div className="debug-v">
                  <a href={backendUrl(`/api/events?request_id=${encodeURIComponent(requestId)}&limit=500&format=ndjson`)} target="_blank" rel="noreferrer">
                    NDJSON
                  </a>
                </div>
              </div>
              <div className="debug-list">
                {!events.length ? (
                  <div className="debug-muted">无事件</div>
                ) : (
                  events.slice(-18).map((e, idx) => (
                    <div key={`${e.ts_ms || 0}_${idx}`} className="debug-item">
                      <div className="debug-item-h">
                        <span>{e.level || 'info'}</span>
                        <span>{e.kind || 'app'}</span>
                      </div>
                      <div className="debug-item-b">
                        <div>{e.name || 'event'}</div>
                        <div className="debug-muted">
                          {e.ts_ms ? new Date(Number(e.ts_ms)).toLocaleTimeString() : '—'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div className="debug-subtitle">一键诊断</div>
          <div className="debug-row">
            <div className="debug-k">操作</div>
            <div className="debug-v">
              <button type="button" className="queue-btn" onClick={runDiag} disabled={diagLoading}>
                {diagLoading ? '诊断中…' : '运行诊断'}
              </button>{' '}
              <a href={backendUrl('/api/logs/download')} target="_blank" rel="noreferrer">
                下载日志
              </a>{' '}
              <a href={backendUrl('/api/logs?tail_kb=256')} target="_blank" rel="noreferrer">
                日志tail
              </a>
            </div>
          </div>
          {diagErr ? <div className="debug-muted">{diagErr}</div> : null}
          {diagData ? (
            <>
              <div className="debug-row">
                <div className="debug-k">ffmpeg</div>
                <div className="debug-v">{diagData.deps && diagData.deps.ffmpeg && diagData.deps.ffmpeg.found ? 'OK' : '缺失'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">RAGFlow</div>
                <div className="debug-v">{diagData.ragflow && diagData.ragflow.connected ? '已连接' : '未连接'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">ASR</div>
                <div className="debug-v">{diagData.asr && diagData.asr.funasr_loaded ? '已加载' : '未加载'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">离线脚本</div>
                <div className="debug-v">{diagData.offline && Number(diagData.offline.items_count || 0) ? `${diagData.offline.items_count}条` : '0条'}</div>
              </div>
            </>
          ) : null}
          {deviceInfo ? (
            <div className="debug-row">
              <div className="debug-k">音频设备</div>
              <div className="debug-v">
                {deviceInfo.permission ? `mic:${deviceInfo.permission}` : 'mic:?'} · {Array.isArray(deviceInfo.devices) ? deviceInfo.devices.length : 0}个
              </div>
            </div>
          ) : null}

          <div className="debug-subtitle">配置管理</div>
          <div className="debug-row">
            <div className="debug-k">操作</div>
            <div className="debug-v">
              <button type="button" className="queue-btn" onClick={exportConfig} disabled={cfgLoading}>
                导出配置
              </button>{' '}
              <label className="queue-btn" style={{ display: 'inline-block' }}>
                导入配置
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e && e.target && e.target.files ? e.target.files[0] : null;
                    if (e && e.target) e.target.value = '';
                    importConfigFile(f);
                  }}
                />
              </label>{' '}
              <button type="button" className="queue-btn" onClick={refreshBackups} disabled={cfgLoading}>
                刷新备份
              </button>
            </div>
          </div>
          {cfgErr ? <div className="debug-muted">{cfgErr}</div> : null}
          {cfgOk ? <div className="debug-muted">{cfgOk}</div> : null}
          {Array.isArray(cfgBackups) && cfgBackups.length ? (
            <div className="debug-list">
              {cfgBackups.slice(0, 10).map((b) => (
                <div key={b.name} className="debug-item">
                  <div className="debug-item-h">
                    <span>{b.name}</span>
                    <span className="debug-muted">{b.size_bytes != null ? `${b.size_bytes}B` : ''}</span>
                  </div>
                  <div className="debug-item-b">
                    <button type="button" className="queue-btn" onClick={() => restoreBackup(b.name)} disabled={cfgLoading}>
                      恢复
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="debug-muted">暂无备份（导入配置后会自动生成）</div>
          )}

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
