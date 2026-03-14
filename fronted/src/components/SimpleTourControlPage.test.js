import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleTourControlPage } from './SimpleTourControlPage';

function render(ui) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(ui);
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

describe('SimpleTourControlPage', () => {
  test('renders start state and forwards click handlers', () => {
    const onToggle = jest.fn();
    const onOpenMainPage = jest.fn();
    const view = render(
      <SimpleTourControlPage isRunning={false} showWave={false} onToggle={onToggle} onOpenMainPage={onOpenMainPage} />
    );

    const mainBtn = view.container.querySelector('.simple-tour-main-btn');
    const titleBtn = view.container.querySelector('.simple-tour-title-btn');
    const wave = view.container.querySelector('.simple-tour-wave');
    expect(mainBtn).toBeTruthy();
    expect(mainBtn.className).toContain('is-start');
    expect(mainBtn.textContent).toContain('\u5f00\u59cb');
    expect(titleBtn).toBeTruthy();
    expect(wave).toBeTruthy();
    expect(wave.className).toContain('is-hidden');
    expect(view.container.querySelector('.simple-tour-main-icon')).toBeNull();

    act(() => {
      mainBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      titleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpenMainPage).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test('switches to stop state', () => {
    const view = render(<SimpleTourControlPage isRunning={false} showWave={false} onToggle={() => {}} onOpenMainPage={() => {}} />);
    view.rerender(<SimpleTourControlPage isRunning showWave onToggle={() => {}} onOpenMainPage={() => {}} />);

    const mainBtn = view.container.querySelector('.simple-tour-main-btn');
    const wave = view.container.querySelector('.simple-tour-wave');
    expect(mainBtn.className).toContain('is-stop');
    expect(mainBtn.textContent).toContain('\u7ed3\u675f');
    expect(wave.className).not.toContain('is-hidden');
    expect(view.container.querySelectorAll('.simple-tour-wave-bar').length).toBe(9);
    view.unmount();
  });
});
