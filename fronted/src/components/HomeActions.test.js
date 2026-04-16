import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HomeActions } from './HomeActions';

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

describe('HomeActions', () => {
  test('renders buttons and forwards clicks', () => {
    const onBackToSimple = jest.fn();
    const onOpenPadHome = jest.fn();
    const onTourToggle = jest.fn();
    const onReset = jest.fn();
    const view = render(
      <HomeActions
        onBackToSimple={onBackToSimple}
        onOpenPadHome={onOpenPadHome}
        onTourToggle={onTourToggle}
        tourToggleLabel="toggle"
        tourToggleDanger
        tourToggleDisabled={false}
        onReset={onReset}
      />
    );

    const buttons = view.container.querySelectorAll('button');
    expect(buttons).toHaveLength(4);
    expect(buttons[2].className).toContain('home-action-danger');

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onBackToSimple).toHaveBeenCalledTimes(1);
    expect(onOpenPadHome).toHaveBeenCalledTimes(1);
    expect(onTourToggle).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test('applies disabled state to tour toggle button', () => {
    const view = render(
      <HomeActions
        onTourToggle={() => {}}
        tourToggleLabel="toggle"
        tourToggleDanger={false}
        tourToggleDisabled
        onReset={() => {}}
      />
    );

    const firstButton = view.container.querySelector('button');
    expect(firstButton.disabled).toBe(true);
    expect(firstButton.className).toContain('home-action-primary');
    expect(view.container.querySelector('.home-actions')).toBeTruthy();
    view.unmount();
  });
});
