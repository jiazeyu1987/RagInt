import React from 'react';
import { backendUrl } from '../api/backendClient';

function StatusPill({ text, tone = 'neutral' }) {
  return <span className={`debug-pill debug-pill-${tone}`}>{String(text || '-')}</span>;
}

function mapQaCacheReason(reason) {
  const code = String(reason || '').trim();
  if (!code) return '-';
  const exactMap = {
    cache_hit: 'cache hit',
    qa_audio_hit: 'qa audio hit',
    lookup_disabled_by_client: 'lookup disabled by client',
    empty_question: 'empty question',
    exact_normalized_question: 'exact normalized question',
    no_candidates_in_tts_bucket: 'no candidates in tts bucket',
    heuristic_similarity_match: 'heuristic similarity match',
    classifier_match: 'classifier match',
    classifier_match_soft_accept: 'classifier soft accept',
    classifier_entity_mismatch_guard: 'entity mismatch guard',
    classifier_confidence_below_threshold: 'classifier below threshold',
    classifier_candidate_not_in_recall_set: 'classifier candidate not in recall set',
    classifier_missing_candidate_id: 'classifier missing candidate id',
    candidate_pair_not_found: 'candidate pair not found',
    candidate_audio_missing: 'candidate audio missing',
    invalid_json: 'invalid json',
  };
  return exactMap[code] || code;
}

function buildRouteSummary({ requestMode, guideModeLabel, cacheLookup, cacheHit, cacheReason }) {
  const parts = [];
  if (requestMode === 'tour') parts.push('tour flow');
  else if (requestMode === 'send') parts.push('ask flow');
  if (guideModeLabel) parts.push(String(guideModeLabel));
  if (cacheLookup === 'yes') parts.push('cache lookup on');
  else if (cacheLookup === 'no') parts.push('cache lookup off');
  if (cacheHit === 'yes') parts.push('cache hit');
  else if (cacheHit === 'no') parts.push('cache miss');
  if (cacheReason && cacheReason !== '-') parts.push(cacheReason);
  return parts.filter(Boolean).join(' / ') || '-';
}

function getEventTsMs(event) {
  const value = Number(event && (event.ts_ms || event.ts || event.created_at_ms));
  return Number.isFinite(value) ? value : null;
}

function formatDurationMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '-';
  return `${Math.round(n)} ms`;
}

function formatAsrStageName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '未知';
  const normalized = raw.replace(/^asr_/, '');
  const labelMap = {
    pending_asr_matched: '匹配到待处理 ASR 文本',
    filtering_started: '开始过滤',
    filtering_finished: '过滤完成',
    filtering_failed: '过滤失败',
    wake_word_missing: '未命中唤醒词',
    wake_word_only: '只有唤醒词',
    wake_word_hold_extended: '延长唤醒保持',
    accepted: '已通过',
    bypass_non_asr: '手动输入跳过后处理',
    error: '错误',
    final_timeout: '最终结果超时',
  };
  return labelMap[normalized] || normalized.replace(/_/g, ' ');
}

function classifyAsrEvent(name, level) {
  const raw = String(name || '').trim().toLowerCase();
  if (raw.includes('error') || raw.includes('timeout')) {
    return { category: 'error', tone: 'danger', legend: '错误 / 超时' };
  }
  if (raw.includes('wake')) {
    return { category: 'wake', tone: 'warn', legend: '唤醒词' };
  }
  if (raw.includes('accepted') || raw.includes('bypass_non_asr')) {
    return { category: 'accepted', tone: 'ok', legend: '已通过' };
  }
  if (raw.includes('filter') || raw.includes('correct') || raw.includes('pending_asr')) {
    return { category: 'filter', tone: 'info', legend: '过滤 / 纠错' };
  }
  return { category: 'state', tone: level === 'warn' ? 'warn' : 'neutral', legend: '运行状态' };
}

function buildAsrLegend(items) {
  const seen = new Set();
  const legend = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = `${item.category}_${item.legend}`;
    if (seen.has(key)) return;
    seen.add(key);
    legend.push({
      key,
      category: item.category,
      legend: item.legend,
      tone: item.tone,
    });
  });
  return legend;
}

function buildAsrTimeline(events) {
  const asrEvents = (Array.isArray(events) ? events : [])
    .filter((event) => String((event && event.name) || '').trim().startsWith('asr_'))
    .map((event) => ({
      ...event,
      __ts: getEventTsMs(event),
    }))
    .filter((event) => Number.isFinite(event.__ts))
    .sort((a, b) => a.__ts - b.__ts);

  if (!asrEvents.length) return { items: [], totalMs: 0 };

  const firstTs = asrEvents[0].__ts;
  const lastTs = asrEvents[asrEvents.length - 1].__ts;
  const totalMs = Math.max(1, lastTs - firstTs);
  const items = asrEvents.map((event, idx) => {
    const next = asrEvents[idx + 1] || null;
    const startMs = Math.max(0, event.__ts - firstTs);
    const durationMs = next ? Math.max(0, next.__ts - event.__ts) : 0;
    const widthPct = totalMs > 0 ? Math.max(6, (durationMs / totalMs) * 100) : 100;
    const classification = classifyAsrEvent(event.name, event.level);
    return {
      key: `${String(event.name || 'asr')}_${event.__ts}_${idx}`,
      name: String(event.name || ''),
      label: formatAsrStageName(event.name),
      tsMs: event.__ts,
      startMs,
      durationMs,
      widthPct,
      fields: event.fields && typeof event.fields === 'object' ? event.fields : {},
      level: String(event.level || 'info'),
      category: classification.category,
      tone: classification.tone,
      legend: classification.legend,
    };
  });
  return { items, totalMs };
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
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event && event.kind === 'nav') {
      navState = String(event.name || 'nav');
      break;
    }
  }
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event || event.name !== 'ask_received') continue;
    const fields = event.fields && typeof event.fields === 'object' ? event.fields : event;
    requestMode = String(fields.request_mode || '-');
    requestActionType = String(fields.action_type || '-');
    requestTourAction = String(fields.tour_action || '-');
    break;
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
    String(guideModeLabel || '').includes('playback') ? 'info' : String(guideModeLabel || '').includes('record') ? 'warn' : 'ok';
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
  const asrTimeline = buildAsrTimeline(events);
  const asrLegend = buildAsrLegend(asrTimeline.items);

  return (
    <Root className={rootClass}>
      <div className="debug-title">Debug Panel</div>
      {!debugInfo ? (
        <div className="debug-muted">Submit a request to populate timing data.</div>
      ) : (
        <>
          <div className="debug-subtitle">Tour / Navigation</div>
          <div className="debug-row">
            <div className="debug-k">current stop</div>
            <div className="debug-v">{tourStopName ? `${tourStopIndex != null ? `#${tourStopIndex} ` : ''}${tourStopName}` : '-'}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">nav state</div>
            <div className="debug-v">{navState}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">tour mode</div>
            <div className="debug-v">{tourMode || '-'}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">guide mode</div>
            <div className="debug-v">
              <StatusPill text={String(guideModeLabel || '-')} tone={guideModeTone} />
            </div>
          </div>

          <div className="debug-row">
            <div className="debug-k">request_id</div>
            <div className="debug-v">{requestId || '-'}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">route summary</div>
            <div className="debug-v">
              <span className="debug-summary-text">{routeSummary}</span>
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">trigger</div>
            <div className="debug-v">{debugInfo.trigger}</div>
          </div>
          <div className="debug-row">
            <div className="debug-k">request mode</div>
            <div className="debug-v">
              <StatusPill text={requestMode} tone={requestModeTone} />
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">tour action</div>
            <div className="debug-v">
              <StatusPill text={requestTourAction} tone={requestMode === 'tour' ? 'warn' : 'neutral'} />
            </div>
          </div>
          <div className="debug-row">
            <div className="debug-k">action type</div>
            <div className="debug-v">{requestActionType}</div>
          </div>

          <div className="debug-subtitle">Cache Route</div>
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

          <div className="debug-subtitle">Backend Status</div>
          {!requestId ? (
            <div className="debug-muted">Waiting for request_id...</div>
          ) : serverStatusErr ? (
            <div className="debug-muted">{serverStatusErr}</div>
          ) : !serverStatus ? (
            <div className="debug-muted">Loading...</div>
          ) : (
            <>
              {(() => {
                const derived = serverStatus.derived_ms && typeof serverStatus.derived_ms === 'object' ? serverStatus.derived_ms : {};
                const renderDerived = (label, key) => (
                  <div className="debug-row" key={key}>
                    <div className="debug-k">{label}</div>
                    <div className="debug-v">{derived[key] != null ? `${derived[key]} ms` : '-'}</div>
                  </div>
                );
                return (
                  <>
                    <div className="debug-row">
                      <div className="debug-k">cancelled</div>
                      <div className="debug-v">{serverStatus.cancelled ? 'yes' : 'no'}</div>
                    </div>
                    {renderDerived('submit->rag first chunk', 'submit_to_rag_first_chunk_ms')}
                    {renderDerived('submit->rag first text', 'submit_to_rag_first_text_ms')}
                    {renderDerived('submit->first segment', 'submit_to_first_segment_ms')}
                    <div className="debug-row">
                      <div className="debug-k">tts_seen</div>
                      <div className="debug-v">{serverStatus.tts_state && serverStatus.tts_state.count != null ? `${serverStatus.tts_state.count}` : '-'}</div>
                    </div>
                    {renderDerived('submit->tts first audio', 'submit_to_tts_first_audio_ms')}
                    {renderDerived('submit->play end', 'submit_to_play_end_ms')}

                    <div className="debug-subtitle">Full Chain Breakdown</div>
                    {renderDerived('asr pending->filter start', 'asr_pending_to_filter_start_ms')}
                    {renderDerived('asr filter', 'asr_filter_ms')}
                    {renderDerived('asr filter->accepted', 'asr_filter_to_accepted_ms')}
                    {renderDerived('asr postprocess total', 'asr_postprocess_total_ms')}
                    {renderDerived('asr accepted->ask start', 'asr_accepted_to_ask_client_start_ms')}
                    {renderDerived('ask start->server submit', 'ask_client_start_to_server_submit_ms')}
                    {renderDerived('rag first chunk->first text', 'rag_first_chunk_to_first_text_ms')}
                    {renderDerived('rag first text->first segment', 'rag_first_text_to_first_segment_ms')}
                    {renderDerived('first segment->tts first audio', 'first_segment_to_tts_first_audio_ms')}
                    {renderDerived('tts first audio->play end', 'tts_first_audio_to_play_end_ms')}
                    {renderDerived('ask start->play end(client)', 'ask_client_start_to_play_end_client_ms')}
                  </>
                );
              })()}
              <div className="debug-row">
                <div className="debug-k">last_error</div>
                <div className="debug-v">{serverStatus.last_error ? `${serverStatus.last_error.kind || 'error'}:${serverStatus.last_error.name || 'error'}` : '-'}</div>
              </div>
            </>
          )}

          <div className="debug-subtitle">Event Timeline</div>
          {!requestId ? (
            <div className="debug-muted">Waiting for request_id...</div>
          ) : serverEventsErr ? (
            <div className="debug-muted">{serverEventsErr}</div>
          ) : !serverEvents ? (
            <div className="debug-muted">Loading...</div>
          ) : (
            <>
              {lastErr ? (
                <div className="debug-row">
                  <div className="debug-k">latest_error</div>
                  <div className="debug-v">{`${lastErr.name || 'error'} ${lastErr.fields && lastErr.fields.err ? String(lastErr.fields.err).slice(0, 80) : ''}`}</div>
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

              <div className="debug-subtitle">ASR 时间轴</div>
              {!asrTimeline.items.length ? (
                <div className="debug-muted">暂时没有 ASR 时间轴事件。</div>
              ) : (
                <div className="debug-asr-timeline">
                  <div className="debug-asr-summary">
                    <span>{asrTimeline.items.length} 个阶段</span>
                    <span>总耗时 {formatDurationMs(asrTimeline.totalMs)}</span>
                  </div>
                  <div className="debug-asr-legend">
                    {asrLegend.map((item) => (
                      <div key={item.key} className="debug-asr-legend-item">
                        <span className={`debug-asr-legend-dot debug-asr-legend-dot-${item.category}`} />
                        <span>{item.legend}</span>
                      </div>
                    ))}
                  </div>
                  <div className="debug-asr-track">
                    {asrTimeline.items.map((item) => (
                      <div
                        key={item.key}
                        className={`debug-asr-segment debug-asr-segment-${item.category} debug-asr-segment-${item.tone}`}
                        style={{ width: `${item.widthPct}%` }}
                        title={`${item.label} | ${item.legend} | 开始 ${formatDurationMs(item.startMs)} | 耗时 ${formatDurationMs(item.durationMs)}`}
                      >
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="debug-list">
                    {asrTimeline.items.map((item) => {
                      const rawText = item.fields.rawText || '';
                      const correctedText = item.fields.correctedText || '';
                      const finalText = item.fields.finalText || item.fields.text || '';
                      return (
                        <div key={`${item.key}_detail`} className={`debug-item debug-item-asr debug-item-asr-${item.category}`}>
                          <div className="debug-item-h">
                            <span>{item.label}</span>
                            <span>{formatDurationMs(item.durationMs)}</span>
                          </div>
                          <div className="debug-item-b">
                            <div>开始于：{formatDurationMs(item.startMs)}</div>
                            <div>发生时间：{new Date(Number(item.tsMs)).toLocaleTimeString()}</div>
                            <div>分组：{item.legend}</div>
                            {rawText ? <div className="debug-asr-detail"><strong>原始：</strong>{String(rawText).slice(0, 120)}</div> : null}
                            {correctedText ? <div className="debug-asr-detail"><strong>纠错后：</strong>{String(correctedText).slice(0, 120)}</div> : null}
                            {finalText ? <div className="debug-asr-detail"><strong>最终提交：</strong>{String(finalText).slice(0, 120)}</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="debug-list">
                {!events.length ? (
                  <div className="debug-muted">No events.</div>
                ) : (
                  events.slice(-18).map((event, idx) => (
                    <div
                      key={`${event.ts_ms || 0}_${idx}`}
                      className={`debug-item ${String((event && event.name) || '').startsWith('asr_') ? `debug-item-asr debug-item-asr-${classifyAsrEvent(event.name, event.level).category}` : ''}`}
                    >
                      <div className="debug-item-h">
                        <span>{event.level || 'info'}</span>
                        <span>{event.kind || 'app'}</span>
                      </div>
                      <div className="debug-item-b">
                        <div>{event.name || 'event'}</div>
                        <div className="debug-muted">{event.ts_ms ? new Date(Number(event.ts_ms)).toLocaleTimeString() : '-'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div className="debug-subtitle">Audience Queue</div>
          <div className="debug-list">
            {!q.length ? (
              <div className="debug-muted">No queued questions.</div>
            ) : (
              q.slice(0, 12).map((item) => (
                <div key={item.id} className="debug-item">
                  <div className="debug-item-h">
                    <span>{item.speaker || 'audience'}</span>
                    <span>{item.priority === 'high' ? 'high' : 'normal'}</span>
                  </div>
                  <div className="debug-item-b">
                    <div className="queue-q">{String(item.text || '').slice(0, 60)}</div>
                    <div className="queue-actions">
                      <button type="button" className="queue-btn" onClick={() => onAnswerQueuedNow && onAnswerQueuedNow(item)}>
                        Answer Now
                      </button>
                      <button type="button" className="queue-btn queue-btn-danger" onClick={() => onRemoveQueuedQuestion && onRemoveQueuedQuestion(item.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="debug-subtitle">Segments</div>
          <div className="debug-list">
            {(debugInfo.segments || []).slice(-12).map((segment, idx) => (
              <div key={`${debugInfo.requestId || 'run'}_${segment.seq}_${idx}`} className="debug-item">
                <div className="debug-item-h">
                  <span>#{segment.seq}</span>
                  <span>{segment.chars} chars</span>
                </div>
                <div className="debug-item-b">
                  <div>request: {segment.ttsRequestAt ? `${(segment.ttsRequestAt - debugInfo.submitAt).toFixed(0)}ms` : '-'}</div>
                  <div>first audio: {segment.ttsFirstAudioAt ? `${(segment.ttsFirstAudioAt - debugInfo.submitAt).toFixed(0)}ms` : '-'}</div>
                  <div>done: {segment.ttsDoneAt ? `${(segment.ttsDoneAt - debugInfo.submitAt).toFixed(0)}ms` : '-'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Root>
  );
}
