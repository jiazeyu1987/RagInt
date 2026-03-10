import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

let mockAppShellRenderCount = 0;

jest.mock('./app/AppShell', () => ({
  __esModule: true,
  default: () => {
    mockAppShellRenderCount += 1;
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'app-shell-mock' });
  },
}));

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

describe('App', () => {
  beforeEach(() => {
    mockAppShellRenderCount = 0;
  });

  test('renders AppShell', () => {
    const view = render(React.createElement(App));
    expect(view.container.querySelector('[data-testid="app-shell-mock"]')).toBeTruthy();
    expect(mockAppShellRenderCount).toBe(1);
    view.unmount();
  });
});

