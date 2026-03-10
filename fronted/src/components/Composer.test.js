import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Composer } from './Composer';

function render(ui) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

function fireClick(node) {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Composer', () => {
  test('wires quick actions and group fields', async () => {
    const onStartTour = jest.fn();
    const onContinueTour = jest.fn();
    const onNextTourStop = jest.fn();
    const onPrevTourStop = jest.fn();
    const onSubmitTextAuto = jest.fn().mockResolvedValue(undefined);
    const onChangeSpeakerName = jest.fn();
    const onChangeQuestionPriority = jest.fn();

    const view = render(
      <Composer
        isRecording={false}
        pointerSupported
        onRecordPointerDown={jest.fn()}
        onRecordPointerUp={jest.fn()}
        onRecordPointerCancel={jest.fn()}
        onRecordClickFallback={jest.fn()}
        groupMode
        speakerName="speaker-a"
        onChangeSpeakerName={onChangeSpeakerName}
        questionPriority="normal"
        onChangeQuestionPriority={onChangeQuestionPriority}
        inputText="hello"
        onChangeInputText={jest.fn()}
        inputElRef={{ current: null }}
        questionQueueLength={2}
        onInterrupt={jest.fn()}
        interruptDisabled={false}
        useAgentMode={false}
        selectedAgentId=""
        onSubmit={(e) => e.preventDefault()}
        onStartTour={onStartTour}
        onContinueTour={onContinueTour}
        onNextTourStop={onNextTourStop}
        onPrevTourStop={onPrevTourStop}
        onSubmitTextAuto={onSubmitTextAuto}
        focusInput={jest.fn()}
      />
    );

    const quickButtons = view.container.querySelectorAll('.quick-actions button');
    fireClick(quickButtons[0]);
    fireClick(quickButtons[1]);
    fireClick(quickButtons[2]);
    fireClick(quickButtons[3]);
    await act(async () => {
      fireClick(quickButtons[4]);
      await Promise.resolve();
    });

    expect(onStartTour).toHaveBeenCalledTimes(1);
    expect(onContinueTour).toHaveBeenCalledTimes(1);
    expect(onNextTourStop).toHaveBeenCalledTimes(1);
    expect(onPrevTourStop).toHaveBeenCalledTimes(1);
    expect(onSubmitTextAuto).toHaveBeenCalledTimes(1);
    expect(onSubmitTextAuto.mock.calls[0][1]).toBe('quick');

    expect(view.container.querySelector('.speaker-input')).toBeTruthy();
    expect(view.container.querySelector('.priority-select')).toBeTruthy();

    view.unmount();
  });
});
