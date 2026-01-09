import React from 'react';

export function ControlBar({
  useAgentMode,
  onChangeUseAgentMode,
  agentOptions,
  selectedAgentId,
  onChangeSelectedAgentId,
  chatOptions,
  selectedChat,
  onChangeSelectedChat,

  guideEnabled,
  onChangeGuideEnabled,
  guideDuration,
  onChangeGuideDuration,
  guideStyle,
  onChangeGuideStyle,
  tourMeta,
  tourZone,
  onChangeTourZone,
  audienceProfile,
  onChangeAudienceProfile,

  groupMode,
  onChangeGroupMode,
  ttsEnabled,
  onChangeTtsEnabled,
  ttsMode,
  onChangeTtsMode,
  ttsSpeed,
  onChangeTtsSpeed,
  continuousTour,
  onChangeContinuousTour,
  tourRecordingEnabled,
  onChangeTourRecordingEnabled,
  playTourRecordingEnabled,
  onChangePlayTourRecordingEnabled,
  tourRecordingOptions,
  selectedTourRecordingId,
  onChangeSelectedTourRecordingId,
  onRenameSelectedTourRecording,
  onDeleteSelectedTourRecording,

  wakeWordEnabled,
  onChangeWakeWordEnabled,
  wakeWord,
  onChangeWakeWord,
  wakeWordCooldownMs,
  onChangeWakeWordCooldownMs,
  wakeWordStrict,
  onChangeWakeWordStrict,

  tourState,
  currentIntent,
  tourStops,
  tourSelectedStopIndex,
  onChangeTourSelectedStopIndex,
  onJump,
  onReset,
}) {
  return (
    <div className="controls">
      <label className="tts-toggle">
        <input type="checkbox" checked={!!useAgentMode} onChange={(e) => onChangeUseAgentMode && onChangeUseAgentMode(e.target.checked)} />
        <span>使用智能体</span>
      </label>

      {useAgentMode ? (
        <label className="kb-select">
          <span>智能体</span>
          <select value={selectedAgentId} onChange={(e) => onChangeSelectedAgentId && onChangeSelectedAgentId(e.target.value)}>
            <option value="">请选择</option>
            {(agentOptions || []).map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="kb-select">
          <span>Chat(会话)</span>
          <select value={selectedChat} onChange={(e) => onChangeSelectedChat && onChangeSelectedChat(e.target.value)}>
            {(chatOptions && chatOptions.length ? chatOptions : [selectedChat]).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="tts-toggle">
        <input type="checkbox" checked={!!guideEnabled} onChange={(e) => onChangeGuideEnabled && onChangeGuideEnabled(e.target.checked)} />
        <span>展厅讲解</span>
      </label>

      {guideEnabled ? (
        <label className="kb-select">
          <span>时长</span>
          <select value={guideDuration} onChange={(e) => onChangeGuideDuration && onChangeGuideDuration(e.target.value)}>
            <option value="30">30秒</option>
            <option value="60">1分钟</option>
            <option value="180">3分钟</option>
            <option value="1200">20分钟</option>
          </select>
        </label>
      ) : null}

      {guideEnabled ? (
        <label className="kb-select">
          <span>风格</span>
          <select value={guideStyle} onChange={(e) => onChangeGuideStyle && onChangeGuideStyle(e.target.value)}>
            <option value="friendly">通俗</option>
            <option value="pro">专业</option>
          </select>
        </label>
      ) : null}

      {guideEnabled ? (
        <label className="kb-select">
          <span>展区</span>
          <select value={tourZone} onChange={(e) => onChangeTourZone && onChangeTourZone(e.target.value)}>
            {(tourMeta && Array.isArray(tourMeta.zones) ? tourMeta.zones : ['默认路线']).map((z) => (
              <option key={String(z)} value={String(z)}>
                {String(z)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {guideEnabled ? (
        <label className="kb-select">
          <span>人群</span>
          <select value={audienceProfile} onChange={(e) => onChangeAudienceProfile && onChangeAudienceProfile(e.target.value)}>
            {(tourMeta && Array.isArray(tourMeta.profiles) ? tourMeta.profiles : ['大众', '儿童', '专业']).map((p) => (
              <option key={String(p)} value={String(p)}>
                {String(p)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="tts-toggle" title="多人围观：轮询提问 + 优先级">
        <input type="checkbox" checked={!!groupMode} onChange={(e) => onChangeGroupMode && onChangeGroupMode(e.target.checked)} />
        <span>多人围观</span>
      </label>

      <label className="tts-toggle">
        <input type="checkbox" checked={!!ttsEnabled} onChange={(e) => onChangeTtsEnabled && onChangeTtsEnabled(e.target.checked)} />
        <span>语音播报</span>
      </label>

      {ttsEnabled ? (
        <label className="kb-select">
          <span>TTS</span>
          <select value={String(ttsMode || 'modelscope')} onChange={(e) => onChangeTtsMode && onChangeTtsMode(e.target.value)}>
            <option value="sovtts1">SOVTTS1</option>
            <option value="sovtts2">SOVTTS2</option>
            <option value="modelscope">ModelScope</option>
            <option value="flash">Flash(cosyvoice-v3-flash)</option>
            <option value="sapi">SAPI</option>
            <option value="edge">Edge</option>
          </select>
        </label>
      ) : null}

      {ttsEnabled ? (
        <label className="kb-select">
          <span>语速</span>
          <select value={String(ttsSpeed || 1.0)} onChange={(e) => onChangeTtsSpeed && onChangeTtsSpeed(Number(e.target.value) || 1.0)}>
            <option value="1">标准(1.0x)</option>
            <option value="1.25">加速(1.25x)</option>
            <option value="1.5">更快(1.5x)</option>
          </select>
        </label>
      ) : null}

      {guideEnabled ? (
        <label className="tts-toggle" title="无人打断时自动从第1站讲到最后，并预取下一站减少停顿">
          <input type="checkbox" checked={!!continuousTour} onChange={(e) => onChangeContinuousTour && onChangeContinuousTour(e.target.checked)} />
          <span>连续讲解</span>
        </label>
      ) : null}

      <div className="tour-status" title="讲解状态机：打断/继续/下一站">
        <span className="tour-status-k">讲解</span>
        <span className="tour-status-v">
          {tourState && tourState.mode === 'idle'
            ? '未开始'
            : `${tourState && tourState.mode === 'running' ? '进行中' : tourState && tourState.mode === 'interrupted' ? '已打断' : '就绪'}${
                tourState && tourState.stopIndex >= 0 ? ` · 第${tourState.stopIndex + 1}站` : ''
              }${tourState && tourState.stopName ? ` · ${tourState.stopName}` : ''}`}
          {currentIntent && currentIntent.intent ? ` · 意图:${currentIntent.intent}` : ''}
        </span>
      </div>

      {guideEnabled ? (
        <div className="tour-controls">
          <select value={String(tourSelectedStopIndex)} onChange={(e) => onChangeTourSelectedStopIndex && onChangeTourSelectedStopIndex(Number(e.target.value) || 0)}>
            {(tourStops && tourStops.length ? tourStops : ['第1站']).map((s, i) => (
              <option key={`${i}_${s}`} value={String(i)}>
                {`第${i + 1}站 ${String(s || '').trim()}`}
              </option>
            ))}
          </select>
          <button type="button" className="tour-jump-btn" onClick={onJump}>
            跳转
          </button>
          <button type="button" className="tour-reset-btn" onClick={onReset} title="清空讲解状态">
            重置
          </button>
        </div>
      ) : null}

      {guideEnabled ? (
        <label className="tts-toggle" title="开始讲解时创建一个存档，保存RAGFlow chunk/segment/done 与对应的TTS wav">
          <input
            type="checkbox"
            checked={!!tourRecordingEnabled}
            onChange={(e) => onChangeTourRecordingEnabled && onChangeTourRecordingEnabled(e.target.checked)}
          />
          <span>录制讲解</span>
        </label>
      ) : null}

      {guideEnabled ? (
        <label className="tts-toggle" title="站点播报使用存档里的文字+语音，不再调用RAGFlow/TTS">
          <input
            type="checkbox"
            checked={!!playTourRecordingEnabled}
            onChange={(e) => onChangePlayTourRecordingEnabled && onChangePlayTourRecordingEnabled(e.target.checked)}
          />
          <span>播放存档</span>
        </label>
      ) : null}

      {guideEnabled && playTourRecordingEnabled ? (
        <label className="kb-select">
          <span>存档</span>
          <select
            value={String(selectedTourRecordingId || '')}
            onChange={(e) => onChangeSelectedTourRecordingId && onChangeSelectedTourRecordingId(e.target.value)}
          >
            <option value="">请选择</option>
            {(tourRecordingOptions || []).map((r) => (
              <option key={String(r.recording_id)} value={String(r.recording_id)}>
                {r.label || String(r.recording_id)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {guideEnabled && playTourRecordingEnabled ? (
        <div className="tour-controls">
          <button type="button" className="tour-jump-btn" onClick={() => onRenameSelectedTourRecording && onRenameSelectedTourRecording()} disabled={!selectedTourRecordingId}>
            重命名
          </button>
          <button type="button" className="tour-reset-btn" onClick={() => onDeleteSelectedTourRecording && onDeleteSelectedTourRecording()} disabled={!selectedTourRecordingId}>
            删除
          </button>
        </div>
      ) : null}

      <label className="tts-toggle" title="Software wake word (browser SpeechRecognition).">
        <input type="checkbox" checked={!!wakeWordEnabled} onChange={(e) => onChangeWakeWordEnabled && onChangeWakeWordEnabled(e.target.checked)} />
        <span>Wake Word</span>
      </label>

      {wakeWordEnabled ? (
        <label className="kb-select">
          <span>Word</span>
          <input value={String(wakeWord || '')} onChange={(e) => onChangeWakeWord && onChangeWakeWord(e.target.value)} placeholder="e.g. 你好小R" />
        </label>
      ) : null}

      {wakeWordEnabled ? (
        <label className="kb-select">
          <span>Cooldown(ms)</span>
          <input
            value={String(wakeWordCooldownMs)}
            onChange={(e) => onChangeWakeWordCooldownMs && onChangeWakeWordCooldownMs(Number(e.target.value) || 0)}
            placeholder="5000"
          />
        </label>
      ) : null}

      {wakeWordEnabled ? (
        <label className="tts-toggle" title="Strict mode uses prefix match to reduce false triggers.">
          <input type="checkbox" checked={!!wakeWordStrict} onChange={(e) => onChangeWakeWordStrict && onChangeWakeWordStrict(e.target.checked)} />
          <span>Strict</span>
        </label>
      ) : null}
    </div>
  );
}

