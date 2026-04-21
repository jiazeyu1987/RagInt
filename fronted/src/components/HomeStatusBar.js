import React from 'react';

function StatusSelect({ label, value, options, onChange, disabled } = {}) {
  const list = Array.isArray(options) ? options : [];
  return (
    <div className="home-status-item" key={String(label || '')}>
      <div className="home-status-k">{String(label || '')}</div>
      <select
        className="home-status-select"
        value={String(value || '')}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={!!disabled || !list.length}
        aria-label={String(label || '')}
      >
        {list.map((item) => (
          <option key={String(item && item.value)} value={String(item && item.value)}>
            {String((item && item.label) || (item && item.value) || '')}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusText({ label, value, tone } = {}) {
  const toneCls = String(tone || '').trim();
  return (
    <div className="home-status-item" key={String(label || '')}>
      <div className="home-status-k">{String(label || '')}</div>
      <div className={`home-status-v ${toneCls}`.trim()} title={String(value || '')}>
        {String(value || '-')}
      </div>
    </div>
  );
}

function formatElapsed(deltaMs, { disabled = false } = {}) {
  if (disabled) return 'disabled';
  const n = Number(deltaMs);
  if (!Number.isFinite(n)) return '-';
  return `${Math.max(0, Math.round(n))} ms`;
}

function buildTimelineItems(debugInfo, serverStatus, { ttsEnabled = true } = {}) {
  const info = debugInfo && typeof debugInfo === 'object' ? debugInfo : null;
  const status = serverStatus && typeof serverStatus === 'object' ? serverStatus : null;
  const derived = status && status.derived_ms && typeof status.derived_ms === 'object' ? status.derived_ms : {};
  const submitAt = info && Number.isFinite(Number(info.submitAt)) ? Number(info.submitAt) : null;
  const calc = (key) => {
    if (submitAt == null) return null;
    const value = Number(info && info[key]);
    return Number.isFinite(value) ? value - submitAt : null;
  };
  const derivedMs = (key) => {
    const value = Number(derived && derived[key]);
    return Number.isFinite(value) ? value : null;
  };
  const sumMs = (a, b) => (a != null && b != null ? Math.round((a + b) * 10) / 10 : null);

  // Prefer server-receive based timeline to avoid client/server clock skew.
  const serverTimeline =
    derivedMs('server_receive_to_request_parse_done_ms') != null || derivedMs('server_receive_to_server_submit_ms') != null;

  const clientSubmitMs = serverTimeline
    ? (() => {
        const v = derivedMs('client_submit_to_server_receive_ms');
        return v != null && v >= 0 ? v : null;
      })()
    : derivedMs('ask_client_start_to_client_submit_ms');
  const serverReceiveMs = serverTimeline ? 0 : derivedMs('ask_client_start_to_server_receive_ms');
  const requestParseMs = serverTimeline
    ? derivedMs('server_receive_to_request_parse_done_ms')
    : derivedMs('ask_client_start_to_request_parse_done_ms');
  const conversationResolvedMs = serverTimeline
    ? derivedMs('server_receive_to_conversation_resolved_ms')
    : derivedMs('ask_client_start_to_conversation_resolved_ms');
  const orchestratorReadyMs = serverTimeline
    ? derivedMs('server_receive_to_orchestrator_ready_ms')
    : derivedMs('ask_client_start_to_orchestrator_ready_ms');
  const qaMatchStartMs = serverTimeline
    ? derivedMs('server_receive_to_qa_match_start_ms')
    : derivedMs('ask_client_start_to_qa_match_start_ms');
  const qaMatchEndMs = serverTimeline
    ? derivedMs('server_receive_to_qa_match_end_ms')
    : derivedMs('ask_client_start_to_qa_match_end_ms');
  const serverSubmitMs = serverTimeline
    ? derivedMs('server_receive_to_server_submit_ms')
    : derivedMs('ask_client_start_to_server_submit_ms');
  const ragRequestMs = serverTimeline
    ? (
        derivedMs('server_receive_to_rag_request_total_ms')
        ?? sumMs(serverSubmitMs, derivedMs('submit_to_rag_request_ms'))
      )
    : derivedMs('ask_client_start_to_rag_request_ms');
  const ragFirstChunkMs = serverTimeline
    ? (
        derivedMs('server_receive_to_rag_first_chunk_ms')
        ?? sumMs(serverSubmitMs, derivedMs('submit_to_rag_first_chunk_ms'))
        ?? sumMs(ragRequestMs, derivedMs('rag_request_to_first_chunk_ms'))
      )
    : (
        serverSubmitMs != null && derivedMs('submit_to_rag_first_chunk_ms') != null
          ? serverSubmitMs + derivedMs('submit_to_rag_first_chunk_ms')
          : ragRequestMs != null && derivedMs('rag_request_to_first_chunk_ms') != null
            ? ragRequestMs + derivedMs('rag_request_to_first_chunk_ms')
            : calc('ragflowFirstChunkAt')
      );
  const ragFirstTextMs = serverTimeline
    ? (
        derivedMs('server_receive_to_rag_first_text_ms')
        ?? sumMs(serverSubmitMs, derivedMs('submit_to_rag_first_text_ms'))
        ?? ragFirstChunkMs
      )
    : (
        serverSubmitMs != null && derivedMs('submit_to_rag_first_text_ms') != null
          ? serverSubmitMs + derivedMs('submit_to_rag_first_text_ms')
          : ragFirstChunkMs
      );
  const firstSegmentMs = serverTimeline
    ? (
        derivedMs('server_receive_to_first_segment_ms')
        ?? sumMs(serverSubmitMs, derivedMs('submit_to_first_segment_ms'))
      )
    : (
        serverSubmitMs != null && derivedMs('submit_to_first_segment_ms') != null
          ? serverSubmitMs + derivedMs('submit_to_first_segment_ms')
          : calc('ragflowFirstSegmentAt')
      );
  const firstAudioMs = serverTimeline
    ? (
        derivedMs('server_receive_to_tts_first_audio_ms')
        ?? sumMs(serverSubmitMs, derivedMs('submit_to_tts_first_audio_ms'))
      )
    : (
        serverSubmitMs != null && derivedMs('submit_to_tts_first_audio_ms') != null
          ? serverSubmitMs + derivedMs('submit_to_tts_first_audio_ms')
          : calc('ttsFirstAudioAt')
      );
  const ragDoneMs = serverTimeline ? derivedMs('server_receive_to_rag_done_ms') : calc('ragflowDoneAt');
  const endMs = serverTimeline ? (derivedMs('server_receive_to_play_end_ms') ?? calc('ttsAllDoneAt')) : calc('ttsAllDoneAt');
  const startReady = serverTimeline || submitAt != null;
  return [
    { key: 'submitAt', label: '开始', value: startReady ? '0 ms' : '-', done: startReady },
    { key: 'clientSubmit', label: '发送', value: formatElapsed(clientSubmitMs), done: clientSubmitMs != null },
    { key: 'serverReceive', label: '服务端接收', value: formatElapsed(serverReceiveMs), done: serverReceiveMs != null },
    { key: 'requestParse', label: '请求解析', value: formatElapsed(requestParseMs), done: requestParseMs != null },
    { key: 'conversationResolved', label: '会话解析', value: formatElapsed(conversationResolvedMs), done: conversationResolvedMs != null },
    { key: 'orchestratorReady', label: '编排启动', value: formatElapsed(orchestratorReadyMs), done: orchestratorReadyMs != null },
    { key: 'qaMatchStart', label: '问题比对开始', value: formatElapsed(qaMatchStartMs), done: qaMatchStartMs != null },
    { key: 'qaMatchEnd', label: '问题比对完成', value: formatElapsed(qaMatchEndMs), done: qaMatchEndMs != null },
    { key: 'serverSubmit', label: '服务端提交', value: formatElapsed(serverSubmitMs), done: serverSubmitMs != null },
    { key: 'ragRequest', label: 'RAG 请求', value: formatElapsed(ragRequestMs), done: ragRequestMs != null },
    { key: 'ragflowFirstChunkAt', label: '首块', value: formatElapsed(ragFirstChunkMs), done: ragFirstChunkMs != null },
    {
      key: 'ragflowFirstTextAt',
      label: '首文本',
      value: formatElapsed(ragFirstTextMs),
      done: ragFirstTextMs != null,
    },
    {
      key: 'ragflowFirstSegmentAt',
      label: '首分段',
      value: formatElapsed(firstSegmentMs),
      done: firstSegmentMs != null,
    },
    {
      key: 'ttsFirstAudioAt',
      label: '首音频',
      value: formatElapsed(firstAudioMs, { disabled: !ttsEnabled }),
      done: ttsEnabled ? firstAudioMs != null : false,
      disabled: !ttsEnabled,
    },
    { key: 'ragflowDoneAt', label: 'RAG 完成', value: formatElapsed(ragDoneMs), done: ragDoneMs != null },
    {
      key: 'ttsAllDoneAt',
      label: '结束',
      value: formatElapsed(endMs, { disabled: !ttsEnabled }),
      done: ttsEnabled ? endMs != null : false,
      disabled: !ttsEnabled,
    },
  ];
}

function RequestTimelineBar({ debugInfo, serverStatus, ttsEnabled } = {}) {
  const info = debugInfo && typeof debugInfo === 'object' ? debugInfo : null;
  const items = buildTimelineItems(info, serverStatus, { ttsEnabled });
  if (!info || !Number.isFinite(Number(info.submitAt))) {
    return (
      <div className="home-status-timeline is-empty" aria-label="链路时间线">
        <div className="home-status-timeline-placeholder">等待触发</div>
      </div>
    );
  }
  return (
    <div className="home-status-timeline" aria-label="链路时间线">
      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 ? <div className={`home-status-timeline-line ${item.done ? 'is-done' : ''}`.trim()} aria-hidden="true" /> : null}
          <div
            className={`home-status-timeline-node ${item.done ? 'is-done' : ''} ${item.disabled ? 'is-disabled' : ''}`.trim()}
            title={`${item.label} ${item.value}`}
          >
            <div className="home-status-timeline-dot" aria-hidden="true" />
            <div className="home-status-timeline-label">{item.label}</div>
            <div className="home-status-timeline-value">{item.value}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function HomeStatusBar({
  modeValue,
  modeOptions,
  onChangeMode,
  speedValue,
  speedOptions,
  onChangeSpeed,
  templateValue,
  templateOptions,
  onChangeTemplate,
  audienceProfileValue,
  audienceProfileOptions,
  onChangeAudienceProfile,
  wakeWordLabel,
  currentStopLabel,
  ragflowStatusLabel,
  ragflowStatusTone,
  ragflowConversationLabel,
  debugInfo,
  serverStatus,
  ttsEnabled = true,
} = {}) {
  return (
    <div className="home-status-shell" role="status" aria-label={'当前讲解状态'}>
      <div className="home-status-bar">
        <StatusSelect label={'当前模式'} value={modeValue} options={modeOptions} onChange={onChangeMode} />
        <StatusSelect label={'语速'} value={speedValue} options={speedOptions} onChange={onChangeSpeed} />
        <StatusSelect label={'模板名称'} value={templateValue} options={templateOptions} onChange={onChangeTemplate} />
        <StatusSelect label={'人群画像'} value={audienceProfileValue} options={audienceProfileOptions} onChange={onChangeAudienceProfile} />
        <StatusText label="RAGFlow" value={ragflowStatusLabel || '检测中'} tone={ragflowStatusTone} />
        <StatusText label={'RAGFlow 对话'} value={ragflowConversationLabel || '无'} />
        <StatusText label={'唤醒词'} value={wakeWordLabel} />
        <StatusText label={'当前站点'} value={currentStopLabel} />
      </div>
      <RequestTimelineBar debugInfo={debugInfo} serverStatus={serverStatus} ttsEnabled={ttsEnabled} />
    </div>
  );
}
