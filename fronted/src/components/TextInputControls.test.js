import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { TextInputControls } from './TextInputControls';

function createView(initialUi) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(initialUi);
  });
  return {
    container,
    rerender: (nextUi) =>
      act(() => {
        root.render(nextUi);
      }),
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

function createBaseProps(overrides = {}) {
  return {
    onSubmit: (e) => e && e.preventDefault && e.preventDefault(),
    isRecording: false,
    isRecognizing: false,
    recognitionStage: '',
    POINTER_SUPPORTED: false,
    onRecordPointerDown: jest.fn(),
    onRecordPointerUp: jest.fn(),
    onRecordPointerCancel: jest.fn(),
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    conversationEnabled: false,
    conversationBusy: false,
    onToggleConversation: jest.fn(),
    inputElRef: { current: null },
    inputText: '',
    onChangeInputText: jest.fn(),
    sendBtnClassName: 'submit-btn submit-btn-normal',
    submitDisabled: false,
    ...overrides,
  };
}

describe('TextInputControls', () => {
  test('renders children directly when children is provided', () => {
    const props = createBaseProps();
    const view = createView(
      <TextInputControls {...props}>
        <div id="custom-slot">custom</div>
      </TextInputControls>
    );

    expect(view.container.querySelector('#custom-slot')).not.toBeNull();
    expect(view.container.querySelector('.record-btn')).toBeNull();
    view.unmount();
  });

  test('forwards conversation toggle, input change, and record click events', () => {
    const props = createBaseProps({ inputText: 'old' });
    const view = createView(<TextInputControls {...props} />);

    const allButtons = view.container.querySelectorAll('button');
    const conversationBtn = allButtons[0];
    const recordBtn = view.container.querySelector('.record-btn');
    const input = view.container.querySelector('input[type="text"]');

    act(() => {
      conversationBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(props.onToggleConversation).toHaveBeenCalledTimes(1);

    act(() => {
      recordBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(props.startRecording).toHaveBeenCalledTimes(1);

    act(() => {
      Simulate.change(input, { target: { value: 'next' } });
    });
    expect(props.onChangeInputText).toHaveBeenCalledWith('next');

    const recordingProps = createBaseProps({
      isRecording: true,
      startRecording: props.startRecording,
      stopRecording: props.stopRecording,
    });
    view.rerender(<TextInputControls {...recordingProps} />);
    const recordingBtn = view.container.querySelector('.record-btn');
    act(() => {
      recordingBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(props.stopRecording).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test('disables buttons for conversation mode and submitDisabled state', () => {
    const props = createBaseProps({
      conversationEnabled: true,
      conversationBusy: true,
      submitDisabled: true,
    });
    const view = createView(<TextInputControls {...props} />);

    const buttons = view.container.querySelectorAll('button');
    const conversationBtn = buttons[0];
    const recordBtn = view.container.querySelector('.record-btn');
    const submitBtn = view.container.querySelector('button[type="submit"]');

    expect(conversationBtn.disabled).toBe(true);
    expect(recordBtn.disabled).toBe(true);
    expect(submitBtn.disabled).toBe(true);
    view.unmount();
  });
});
