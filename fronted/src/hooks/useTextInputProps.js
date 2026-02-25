import { useCallback, useMemo } from 'react';

export function useTextInputProps({
  isRecording,
  pointerSupported,
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
  setInputText,
  sendBtnClassName,
  submitDisabled,
  setSettingsOpen,
} = {}) {
  const onOpenSettings = useCallback(() => setSettingsOpen(true), [setSettingsOpen]);
  const onCloseSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);

  const textInputProps = useMemo(
    () => ({
      isRecording,
      POINTER_SUPPORTED: pointerSupported,
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
      onChangeInputText: setInputText,
      sendBtnClassName,
      submitDisabled,
      onOpenSettings,
    }),
    [
      conversationBusy,
      conversationEnabled,
      inputElRef,
      inputText,
      isRecording,
      onRecordPointerCancel,
      onRecordPointerDown,
      onRecordPointerUp,
      onToggleConversation,
      onOpenSettings,
      pointerSupported,
      sendBtnClassName,
      setInputText,
      startRecording,
      stopRecording,
      submitDisabled,
    ]
  );

  return { textInputProps, onOpenSettings, onCloseSettings };
}
