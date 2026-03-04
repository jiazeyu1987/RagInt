import React from 'react';
import { TextInputBar } from './TextInputBar';

function getRecognitionStageText(stage) {
  if (stage === 'capturing') return '正在采集语音';
  if (stage === 'waiting_min_duration') return '等待达到最短录音时长';
  if (stage === 'awaiting_final') return '等待最终识别结果';
  if (stage === 'receiving_partial') return '正在接收中间结果';
  if (stage === 'wake_detected') return '已检测到唤醒词';
  if (stage === 'streaming') return '正在发送到 ASR';
  if (stage === 'final_received') return '已收到最终结果';
  if (stage === 'final_timeout') return '等待最终结果超时';
  if (stage === 'error') return '识别出错';
  return '';
}

export function TextInputControls({
  onSubmit,
  children,
  isRecording,
  isRecognizing,
  recognitionStage,
  POINTER_SUPPORTED,
  onRecordPointerDown,
  onRecordPointerUp,
  onRecordPointerCancel,
  startRecording,
  stopRecording,
  conversationEnabled,
  conversationBusy,
  onToggleConversation,
  inputElRef,
  inputText,
  onChangeInputText,
  sendBtnClassName,
  submitDisabled,
}) {
  if (children) return <TextInputBar onSubmit={onSubmit}>{children}</TextInputBar>;

  const conversationDisabled = !!conversationBusy || (!conversationEnabled && !!isRecording);
  const pttDisabled = !!conversationEnabled || !!conversationBusy;
  const recognitionStageText = getRecognitionStageText(recognitionStage);
  const recordTitle = conversationEnabled
    ? '对话模式已开启'
    : isRecording
      ? '正在录音，松开后停止采集。'
      : isRecognizing
        ? `麦克风采集已停止，识别仍在继续${recognitionStageText ? `：${recognitionStageText}` : ''}`
        : '按住开始录音，松开后停止采集，识别继续完成。';
  const recordLabel = isRecording ? '停止录音' : isRecognizing ? '识别中' : '语音输入';
  const recordText = isRecording ? '停止' : isRecognizing ? '识别' : '语音';

  return (
    <TextInputBar onSubmit={onSubmit}>
      <button
        type="button"
        className={conversationEnabled ? 'stop-btn' : ''}
        onClick={onToggleConversation}
        disabled={conversationDisabled}
        title={conversationEnabled ? '结束对话模式并释放麦克风' : '开启对话模式'}
        aria-label={conversationEnabled ? '结束对话模式' : '开启对话模式'}
      >
        {conversationEnabled ? '结束对话' : '开启对话'}
      </button>

      <button
        className={`record-btn ${isRecording ? 'recording' : ''} ${isRecognizing && !isRecording ? 'recognizing' : ''}`}
        onPointerDown={onRecordPointerDown}
        onPointerUp={onRecordPointerUp}
        onPointerCancel={onRecordPointerCancel}
        onPointerLeave={onRecordPointerCancel}
        onClick={() => {
          if (pttDisabled) return;
          if (POINTER_SUPPORTED) return;
          if (isRecording) stopRecording();
          else startRecording();
        }}
        type="button"
        disabled={pttDisabled}
        title={recordTitle}
        aria-label={recordLabel}
      >
        {recordText}
      </button>

      <input
        type="text"
        ref={inputElRef}
        value={inputText}
        onChange={(e) => onChangeInputText(e.target.value)}
        placeholder={
          isRecognizing
            ? `正在识别，你可以继续编辑...${recognitionStageText ? `（${recognitionStageText}）` : ''}`
            : '请输入问题...'
        }
        disabled={false}
      />

      <button type="submit" className={sendBtnClassName} disabled={submitDisabled} title="发送">
        发送
      </button>
    </TextInputBar>
  );
}
