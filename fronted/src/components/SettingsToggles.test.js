import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsToggles } from './SettingsToggles';

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

describe('SettingsToggles', () => {
  test('toggles history/debug visibility', () => {
    const onChangeShowHistoryPanel = jest.fn();
    const onChangeShowDebugPanel = jest.fn();
    const view = render(
      <SettingsToggles
        showHistoryPanel={false}
        onChangeShowHistoryPanel={onChangeShowHistoryPanel}
        showDebugPanel={true}
        onChangeShowDebugPanel={onChangeShowDebugPanel}
      />
    );

    const checks = view.container.querySelectorAll('input[type="checkbox"]');
    act(() => {
      checks[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      checks[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChangeShowHistoryPanel).toHaveBeenCalled();
    expect(onChangeShowDebugPanel).toHaveBeenCalled();
    view.unmount();
  });
});
