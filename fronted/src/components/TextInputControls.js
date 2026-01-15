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
  inputElRef,
  inputText,
  onChangeInputText,
  sendBtnClassName,
  submitDisabled,
  onOpenSettings,
}) {
  if (children) return <TextInputBar onSubmit={onSubmit}>{children}</TextInputBar>;

  return (
    <TextInputBar onSubmit={onSubmit}>
      <button
        className={`record-btn ${isRecording ? 'recording' : ''}`}
        onPointerDown={onRecordPointerDown}
        onPointerUp={onRecordPointerUp}
        onPointerCancel={onRecordPointerCancel}
        onPointerLeave={onRecordPointerCancel}
        onClick={() => {
          if (POINTER_SUPPORTED) return;
          if (isRecording) stopRecording();
          else startRecording();
        }}
        type="button"
        title="按住说话，松开后识别并填入输入框"
        aria-label={isRecording ? '录音中' : '语音输入'}
      >
        {isRecording ? '■' : '??'}
      </button>

      <input
        type="text"
        ref={inputElRef}
        value={inputText}
        onChange={(e) => onChangeInputText(e.target.value)}
        placeholder="输入问题…"
        disabled={false}
      />

      <button type="submit" className={sendBtnClassName} disabled={submitDisabled} title="提交">
        发送
      </button>

      <button type="button" className="settings-btn" onClick={onOpenSettings} title="设置" aria-label="设置">
        ?
      </button>
    </TextInputBar>
  );
}
