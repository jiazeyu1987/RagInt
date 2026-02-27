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
} = {}) {
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
      pointerSupported,
      sendBtnClassName,
      setInputText,
      startRecording,
      stopRecording,
      submitDisabled,
    ]
  );

  const onFocusInput = useCallback(() => {
    try {
      if (inputElRef && inputElRef.current && typeof inputElRef.current.focus === 'function') {
        inputElRef.current.focus();
      }
    } catch (_) {
      // ignore
    }
  }, [inputElRef]);

  return { textInputProps, onFocusInput };
}
