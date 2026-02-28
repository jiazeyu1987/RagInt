import React from 'react';
import { backendUrl } from '../api/backendClient';

function StatusPill({ text, tone = 'neutral' }) {
  return <span className={`debug-pill debug-pill-${tone}`}>{String(text || '-')}</span>;
}

function mapQaCacheReason(reason) {
  const code = String(reason || '').trim();
  if (!code) return '-';
  const prefixMap = [
    ['classifier_no_match:', '分类器判定不匹配'],
    ['classifier_', '分类器判定'],
  ];
  for (const [prefix, label] of prefixMap) {
    if (code.startsWith(prefix)) return `${label}: ${code.slice(prefix.length) || '-'}`;
  }
  const exactMap = {
    cache_hit: '缓存命中',
    qa_audio_hit: '问答音频缓存命中',
    lookup_disabled_by_client: '当前请求禁用缓存判定',
    empty_question: '问题为空',
    exact_normalized_question: '规范化问题完全匹配',
    no_candidates_in_tts_bucket: '当前音色桶内无候选',
    heuristic_similarity_match: '启发式相似匹配',
    classifier_match: '分类器匹配',
    classifier_match_soft_accept: '分类器低阈值接受',
    classifier_entity_mismatch_guard: '实体不一致，已拦截',
    classifier_confidence_below_threshold: '分类器置信度低于阈值',
    classifier_candidate_not_in_recall_set: '分类器候选不在召回集',
    classifier_missing_candidate_id: '分类器未返回候选ID',
    candidate_pair_not_found: '候选问答对不存在',
    candidate_audio_missing: '候选音频缺失',
    invalid_json: '分类器返回无效JSON',
  };
  return exactMap[code] || code;
}

function buildRouteSummary({ requestMode, guideModeLabel, cacheLookup, cacheHit, cacheReason }) {
  const parts = [];
  if (requestMode === 'tour') parts.push('讲解流程');
  else if (requestMode === 'send') parts.push('发送问答');

  const guideMode = String(guideModeLabel || '').trim();
  if (guideMode) parts.push(guideMode);

  if (cacheLookup === 'yes') parts.push('缓存判定开启');
  else if (cacheLookup === 'no') parts.push('缓存判定关闭');

  if (cacheHit === 'yes') parts.push('缓存已命中');
  else if (cacheHit === 'no') parts.push('缓存未命中');

  if (cacheReason && cacheReason !== '-') parts.push(cacheReason);
  return parts.filter(Boolean).join(' / ') || '-';
}

export function DebugPanel({
  debugInfo,
  qaCacheDebug,
  guideModeLabel,
  ttsEnabled,
  tourState,
  serverStatus,
  serverStatusErr,
  serverEvents,
  serverEventsErr,
  serverLastError,
  questionQueue,
  onAnswerQueuedNow,
  onRemoveQueuedQuestion,
  embedded = false,
}) {
  const q = Array.isArray(questionQueue) ? questionQueue : [];
  const requestId = debugInfo && debugInfo.requestId ? String(debugInfo.requestId) : '';
  const events = Array.isArray(serverEvents) ? serverEvents : [];
  const lastErr = serverLastError || null;
  const tour = tourState && typeof tourState === 'object' ? tourState : null;
  const tourStopName = tour && tour.stopName ? String(tour.stopName) : '';
  const tourStopIndex = tour && Number.isFinite(Number(tour.stopIndex)) ? Number(tour.stopIndex) : null;
  const tourMode = tour && tour.mode ? String(tour.mode) : '';
  const rootClass = `debug-panel${embedded ? ' debug-panel-embedded' : ''}`;
  const Root = embedded ? 'div' : 'aside';

  let navState = '-';
  let requestMode = '-';
  let requestActionType = '-';
  let requestTourAction = '-';
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

  try {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (!e || e.name !== 'ask_received') continue;
      const fields = e.fields && typeof e.fields === 'object' ? e.fields : e;
      requestMode = String(fields.request_mode || '-');
      requestActionType = String(fields.action_type || '-');
      requestTourAction = String(fields.tour_action || '-');
      break;
    }
  } catch (_) {
    // ignore
  }

  const cacheDebug = qaCacheDebug && typeof qaCacheDebug === 'object' ? qaCacheDebug : null;
  const cacheLookupEnabled =
    cacheDebug && typeof cacheDebug.lookup_enabled === 'boolean' ? (cacheDebug.lookup_enabled ? 'yes' : 'no') : null;
  const cacheHit = cacheDebug && typeof cacheDebug.hit === 'boolean' ? (cacheDebug.hit ? 'yes' : 'no') : '-';
  const cacheType = cacheDebug && cacheDebug.type ? String(cacheDebug.type) : '-';
  const cacheReason = mapQaCacheReason(cacheDebug && cacheDebug.reason ? String(cacheDebug.reason) : '-');
  const cachePairId = cacheDebug && Number.isFinite(Number(cacheDebug.pair_id)) ? String(Number(cacheDebug.pair_id)) : '-';
  const cacheConfidence =
    cacheDebug && Number.isFinite(Number(cacheDebug.confidence)) ? Number(cacheDebug.confidence).toFixed(3) : '-';
  const guideModeTone =
    String(guideModeLabel || '').includes('播放') ? 'info' : String(guideModeLabel || '').includes('录制') ? 'warn' : 'ok';
  const requestModeTone = requestMode === 'tour' ? 'warn' : requestMode === 'send' ? 'ok' : 'neutral';
  const resolvedCacheLookup = cacheLookupEnabled || (requestMode === 'tour' ? 'no' : '-');
  const lookupTone = resolvedCacheLookup === 'yes' ? 'ok' : 'danger';
  const hitTone = cacheHit === 'yes' ? 'ok' : cacheHit === 'no' ? 'danger' : 'neutral';
  const routeSummary = buildRouteSummary({
    requestMode,
    guideModeLabel,
    cacheLookup: resolvedCacheLookup,
    cacheHit,
    cacheReason,
  });

  return (
    <Root className={rootClass}>
      <div className="debug-title">调试面板</div>
      {!debugInfo ? (
        <div className="debug-muted">点击发送后显示耗时</div>
      ) : (
        <>
          <div className="debug-subtitle">讲解 / 移动</div>
          <div className="debug-row">
            <div className="debug-k">当前站点</div>
            <div className="debug-v">{tourStopName ? `${tourStopIndex != null ? `#${tourStopIndex} ` : ''}${tourStopName}` : '-'}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">移动状态</div>
            <div className="debug-v">{navState}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">tour_mode</div>
            <div className="debug-v">{tourMode || '-'}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">guide_mode</div>
            <div className="debug-v">
              <StatusPill text={String(guideModeLabel || '-')} tone={guideModeTone} />
            </div>
          </div>

          <div className="debug-row">
            <div className="debug-k">request_id</div>
            <div className="debug-v">{requestId || '-'}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">route_summary</div>
            <div className="debug-v">
              <span className="debug-summary-text">{routeSummary}</span>
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">trigger</div>
            <div className="debug-v">{debugInfo.trigger}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">request_mode</div>
            <div className="debug-v">
              <StatusPill text={requestMode} tone={requestModeTone} />
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">tour_action</div>
            <div className="debug-v">
              <StatusPill text={requestTourAction} tone={requestMode === 'tour' ? 'warn' : 'neutral'} />
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">action_type</div>
            <div className="debug-v">{requestActionType}</div>
          </div>

          <div className="debug-subtitle">缓存路由</div>
          <div className="debug-row">
            <div className="debug-k">qa_cache_lookup</div>
            <div className="debug-v">
              <StatusPill text={resolvedCacheLookup} tone={lookupTone} />
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">qa_cache_hit</div>
            <div className="debug-v">
              <StatusPill text={cacheHit} tone={hitTone} />
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">qa_cache_type</div>
            <div className="debug-v">{cacheType}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">qa_cache_reason</div>
            <div className="debug-v">{cacheReason}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">qa_cache_pair</div>
            <div className="debug-v">{cachePairId}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">qa_cache_conf</div>
            <div className="debug-v">{cacheConfidence}</div>
          </div>

          <div className="debug-row">
            <div className="debug-k">submit -> first chunk</div>
            <div className="debug-v">
              {debugInfo.ragflowFirstChunkAt ? `${(debugInfo.ragflowFirstChunkAt - debugInfo.submitAt).toFixed(0)} ms` : '-'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">submit -> first segment</div>
            <div className="debug-v">
              {debugInfo.ragflowFirstSegmentAt ? `${(debugInfo.ragflowFirstSegmentAt - debugInfo.submitAt).toFixed(0)} ms` : '-'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">submit -> first TTS audio</div>
            <div className="debug-v">
              {debugInfo.ttsFirstAudioAt ? `${(debugInfo.ttsFirstAudioAt - debugInfo.submitAt).toFixed(0)} ms` : ttsEnabled ? '-' : 'disabled'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">submit -> RAG done</div>
            <div className="debug-v">
              {debugInfo.ragflowDoneAt ? `${(debugInfo.ragflowDoneAt - debugInfo.submitAt).toFixed(0)} ms` : '-'}
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">submit -> TTS done</div>
            <div className="debug-v">
              {debugInfo.ttsAllDoneAt ? `${(debugInfo.ttsAllDoneAt - debugInfo.submitAt).toFixed(0)} ms` : ttsEnabled ? '-' : 'disabled'}
            </div>
          </div>

          <div className="debug-subtitle">后端状态</div>
          {!requestId ? (
            <div className="debug-muted">等待 request_id...</div>
          ) : serverStatusErr ? (
            <div className="debug-muted">{serverStatusErr}</div>
          ) : !serverStatus ? (
            <div className="debug-muted">查询中...</div>
          ) : (
            <>
              <div className="debug-row">
                <div className="debug-k">cancelled</div>
                <div className="debug-v">{serverStatus.cancelled ? 'yes' : 'no'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit->rag first chunk</div>
                <div className="debug-v">
                  {serverStatus.derived_ms && serverStatus.derived_ms.submit_to_rag_first_chunk_ms != null
                    ? `${serverStatus.derived_ms.submit_to_rag_first_chunk_ms} ms`
                    : '-'}
                </div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit->rag first text</div>
                <div className="debug-v">
                  {serverStatus.derived_ms && serverStatus.derived_ms.submit_to_rag_first_text_ms != null
                    ? `${serverStatus.derived_ms.submit_to_rag_first_text_ms} ms`
                    : '-'}
                </div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit->first segment</div>
                <div className="debug-v">
                  {serverStatus.derived_ms && serverStatus.derived_ms.submit_to_first_segment_ms != null
                    ? `${serverStatus.derived_ms.submit_to_first_segment_ms} ms`
                    : '-'}
                </div>
              </div>
              <div className="debug-row">
                <div className="debug-k">tts_seen</div>
                <div className="debug-v">{serverStatus.tts_state && serverStatus.tts_state.count != null ? `${serverStatus.tts_state.count}` : '-'}</div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit->tts first audio</div>
                <div className="debug-v">
                  {serverStatus.derived_ms && serverStatus.derived_ms.submit_to_tts_first_audio_ms != null
                    ? `${serverStatus.derived_ms.submit_to_tts_first_audio_ms} ms`
                    : '-'}
                </div>
              </div>
              <div className="debug-row">
                <div className="debug-k">submit->play end</div>
                <div className="debug-v">
                  {serverStatus.derived_ms && serverStatus.derived_ms.submit_to_play_end_ms != null
                    ? `${serverStatus.derived_ms.submit_to_play_end_ms} ms`
                    : '-'}
                </div>
              </div>
              {serverStatus.last_error ? (
                <div className="debug-row">
                  <div className="debug-k">last_error</div>
                  <div className="debug-v">{`${serverStatus.last_error.kind || 'error'}:${serverStatus.last_error.name || 'error'}`}</div>
                </div>
              ) : null}
            </>
          )}

          <div className="debug-subtitle">事件时间线</div>
          {!requestId ? (
            <div className="debug-muted">等待 request_id...</div>
          ) : serverEventsErr ? (
            <div className="debug-muted">{serverEventsErr}</div>
          ) : !serverEvents ? (
            <div className="debug-muted">查询中...</div>
          ) : (
            <>
              {lastErr ? (
                <div className="debug-row">
                  <div className="debug-k">latest_error</div>
                  <div className="debug-v">{`${lastErr.name || 'error'} ${(lastErr.fields && lastErr.fields.err) ? String(lastErr.fields.err).slice(0, 80) : ''}`}</div>
                </div>
              ) : null}
              <div className="debug-row">
                <div className="debug-k">export</div>
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
                        <div className="debug-muted">{e.ts_ms ? new Date(Number(e.ts_ms)).toLocaleTimeString() : '-'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
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
                      <button type="button" className="queue-btn queue-btn-danger" onClick={() => onRemoveQueuedQuestion && onRemoveQueuedQuestion(item.id)}>
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
            {(debugInfo.segments || []).slice(-12).map((s, idx) => (
              <div key={`${debugInfo.requestId || 'run'}_${s.seq}_${idx}`} className="debug-item">
                <div className="debug-item-h">
                  <span>#{s.seq}</span>
                  <span>{s.chars} chars</span>
                </div>
                <div className="debug-item-b">
                  <div>request: {s.ttsRequestAt ? `${(s.ttsRequestAt - debugInfo.submitAt).toFixed(0)}ms` : '-'}</div>
                  <div>first audio: {s.ttsFirstAudioAt ? `${(s.ttsFirstAudioAt - debugInfo.submitAt).toFixed(0)}ms` : '-'}</div>
                  <div>done: {s.ttsDoneAt ? `${(s.ttsDoneAt - debugInfo.submitAt).toFixed(0)}ms` : '-'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Root>
  );
}
