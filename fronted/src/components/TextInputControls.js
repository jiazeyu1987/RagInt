import React from 'react';
import { TextInputBar } from './TextInputBar';

export function TextInputControls({
  onSubmit,
  children,
  isRecording,
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

  return (
    <TextInputBar onSubmit={onSubmit}>
      <button
        type="button"
        className={conversationEnabled ? 'stop-btn' : ''}
        onClick={onToggleConversation}
        disabled={conversationDisabled}
        title={conversationEnabled ? '结束对话并释放麦克风' : '开始对话并保持麦克风权限'}
        aria-label={conversationEnabled ? '结束对话' : '开始对话'}
      >
        {conversationEnabled ? '结束对话' : '开始对话'}
      </button>

      <button
        className={`record-btn ${isRecording ? 'recording' : ''}`}
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
        title={conversationEnabled ? '对话模式中不可用' : '按住说话，松开后识别并填入输入框'}
        aria-label={isRecording ? '录音中' : '语音输入'}
      >
        {isRecording ? '●' : '🎤'}
      </button>

      <input
        type="text"
        ref={inputElRef}
        value={inputText}
        onChange={(e) => onChangeInputText(e.target.value)}
        placeholder="输入问题..."
        disabled={false}
      />

      <button type="submit" className={sendBtnClassName} disabled={submitDisabled} title="提交">
        发送
      </button>
    </TextInputBar>
  );
}

