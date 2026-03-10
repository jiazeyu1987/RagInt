import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useTextInputProps } from './useTextInputProps';

describe('useTextInputProps', () => {
  test('returns mapped text input props and focuses input', () => {
    const focus = jest.fn();
    const inputElRef = { current: { focus } };
    const setInputText = jest.fn();

    const hook = renderHook((p) => useTextInputProps(p), {
      isRecording: false,
      isRecognizing: true,
      recognitionStage: 'receiving_partial',
      pointerSupported: true,
      onRecordPointerDown: jest.fn(),
      onRecordPointerUp: jest.fn(),
      onRecordPointerCancel: jest.fn(),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      conversationEnabled: true,
      conversationBusy: false,
      onToggleConversation: jest.fn(),
      inputElRef,
      inputText: 'abc',
      setInputText,
      sendBtnClassName: 'submit-btn submit-btn-normal',
      submitDisabled: false,
    });

    expect(hook.result().textInputProps).toEqual(
      expect.objectContaining({
        isRecognizing: true,
        recognitionStage: 'receiving_partial',
        POINTER_SUPPORTED: true,
        inputText: 'abc',
        onChangeInputText: setInputText,
      })
    );

    act(() => {
      hook.result().onFocusInput();
    });
    expect(focus).toHaveBeenCalledTimes(1);

    hook.unmount();
  });
});

