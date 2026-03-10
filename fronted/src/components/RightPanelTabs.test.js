import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RightPanelTabs } from './RightPanelTabs';

let latestHistoryProps = null;
let latestDebugProps = null;

jest.mock('./HistoryPanel', () => ({
  HistoryPanel: (props) => {
    latestHistoryProps = props;
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'history-panel-mock' });
  },
}));

jest.mock('./DebugPanel', () => ({
  DebugPanel: (props) => {
    latestDebugProps = props;
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'debug-panel-mock' });
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

describe('RightPanelTabs', () => {
  test('switches between history and debug tabs', () => {
    latestHistoryProps = null;
    latestDebugProps = null;

    const view = render(
      <RightPanelTabs
        showHistoryPanel
        historySort="time"
        onChangeHistorySort={jest.fn()}
        historyItems={[]}
        onPickHistoryQuestion={jest.fn()}
        showDebugPanel
        debugInfo={{ requestId: 'r1' }}
        qaCacheDebug={{}}
        guideModeLabel="guide"
        ttsEnabled
        tourState={{ mode: 'idle' }}
        serverStatus={null}
        serverStatusErr={null}
        serverEvents={[]}
        serverEventsErr={null}
        serverLastError={null}
        questionQueue={[]}
        onAnswerQueuedNow={jest.fn()}
        onRemoveQueuedQuestion={jest.fn()}
      />
    );

    expect(view.container.querySelector('[data-testid="history-panel-mock"]')).toBeTruthy();
    expect(latestHistoryProps).toEqual(expect.objectContaining({ embedded: true, historySort: 'time' }));

    const tabs = view.container.querySelectorAll('.right-panel-tab-btn');
    act(() => {
      tabs[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="debug-panel-mock"]')).toBeTruthy();
    expect(latestDebugProps).toEqual(expect.objectContaining({ embedded: true, guideModeLabel: 'guide' }));

    view.unmount();
  });
});

