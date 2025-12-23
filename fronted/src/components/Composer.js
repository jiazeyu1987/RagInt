import React from 'react';

export function Composer({
  isRecording,
  pointerSupported,
  onRecordPointerDown,
  onRecordPointerUp,
  onRecordPointerCancel,
  onRecordClickFallback,

  groupMode,
  speakerName,
  onChangeSpeakerName,
  questionPriority,
  onChangeQuestionPriority,

  inputText,
  onChangeInputText,
  inputElRef,

  questionQueueLength,
  onInterrupt,
  interruptDisabled,
  useAgentMode,
  selectedAgentId,
  onSubmit,

  onStartTour,
  onContinueTour,
  onNextTourStop,
  onPrevTourStop,
  onSubmitTextAuto,
  focusInput,
}) {
  const buttons = [
    { label: '开始讲解', action: 'tour_start', auto: true, primary: true },
    { label: '继续讲解', action: 'tour_continue', auto: true, primary: true },
    { label: '下一站', action: 'tour_next', auto: true },
    { label: '上一站', action: 'tour_prev', auto: true },
    { label: '30秒总结', text: '请用30秒总结刚才的讲解' },
    { label: '更通俗', text: '换个更通俗易懂的说法' },
    { label: '更专业', text: '换个更专业的讲法' },
  ];

  const submitDisabled = !String(inputText || '').trim() || (useAgentMode && !selectedAgentId);

  return (
    <div className="input-section">
      <div className="voice-input">
        <button
          className={`record-btn ${isRecording ? 'recording' : ''}`}
          onPointerDown={onRecordPointerDown}
          onPointerUp={onRecordPointerUp}
          onPointerCancel={onRecordPointerCancel}
          onPointerLeave={onRecordPointerCancel}
          onClick={onRecordClickFallback}
          type="button"
          title="按住说话，松开发送识别结果到输入框"
        >
          {isRecording ? '录音中…' : '按住说话'}
        </button>
      </div>

      <form className="text-input" onSubmit={onSubmit}>
        {groupMode ? (
          <>
            <input
              className="speaker-input"
              value={speakerName}
              onChange={(e) => onChangeSpeakerName && onChangeSpeakerName(e.target.value)}
              placeholder="提问人…"
              title="多人围观模式：提问人名称"
            />
            <select
              className="priority-select"
              value={questionPriority}
              onChange={(e) => onChangeQuestionPriority && onChangeQuestionPriority(e.target.value)}
              title="多人围观模式：问题优先级（高优先会打断当前回答）"
            >
              <option value="normal">普通</option>
              <option value="high">高优先</option>
            </select>
          </>
        ) : null}

        <input
          type="text"
          ref={inputElRef}
          value={inputText}
          onChange={(e) => onChangeInputText && onChangeInputText(e.target.value)}
          placeholder="输入问题…"
          disabled={false}
        />

        {groupMode ? (
          <span className="queue-badge" title="围观提问队列">
            {Number(questionQueueLength || 0)}
          </span>
        ) : null}

        <button type="button" className="stop-btn" onClick={onInterrupt} disabled={!!interruptDisabled} title="打断当前回答/播报">
          打断
        </button>

        <button type="submit" disabled={submitDisabled}>
          发送
        </button>
      </form>

      <div className="quick-actions">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            className={b.primary ? 'quick-btn quick-btn-primary' : 'quick-btn'}
            onClick={async () => {
              if (b.auto) {
                if (b.action === 'tour_start') return onStartTour && onStartTour();
                if (b.action === 'tour_continue') return onContinueTour && onContinueTour();
                if (b.action === 'tour_next') return onNextTourStop && onNextTourStop();
                if (b.action === 'tour_prev') return onPrevTourStop && onPrevTourStop();
                return;
              }
              if (b.text) {
                if (onSubmitTextAuto) {
                  await onSubmitTextAuto(b.text, 'quick');
                  return;
                }
                if (onChangeInputText) onChangeInputText(b.text);
                if (focusInput) focusInput();
              }
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

