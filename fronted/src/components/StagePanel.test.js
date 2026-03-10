import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { StagePanel } from './StagePanel';

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

describe('StagePanel', () => {
  test('fires stage action callbacks', () => {
    const onPause = jest.fn();
    const onContinue = jest.fn();
    const onRestart = jest.fn();
    const onSkip = jest.fn();
    const onToggleSpeed = jest.fn();

    const view = render(
      <StagePanel
        onPause={onPause}
        onContinue={onContinue}
        onRestart={onRestart}
        onSkip={onSkip}
        onToggleSpeed={onToggleSpeed}
        speedLabel="fast"
        disabled={false}
      />
    );

    const btns = view.container.querySelectorAll('button');
    act(() => {
      btns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      btns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      btns[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      btns[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      btns[4].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onToggleSpeed).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

