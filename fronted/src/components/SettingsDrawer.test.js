import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsDrawer } from './SettingsDrawer';

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

describe('SettingsDrawer', () => {
  test('renders only when open and closes by escape/mask click', () => {
    const onClose = jest.fn();
    const closed = render(<SettingsDrawer open={false} onClose={onClose} />);
    expect(closed.container.querySelector('.settings-overlay')).toBeFalsy();
    closed.unmount();

    const view = render(
      <SettingsDrawer open title="Settings" onClose={onClose}>
        <div data-testid="child">child</div>
      </SettingsDrawer>
    );
    expect(view.container.querySelector('.settings-overlay')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="child"]')).toBeTruthy();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = view.container.querySelector('.settings-overlay');
    act(() => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});

