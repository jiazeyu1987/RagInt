import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MainLayout } from './MainLayout';

let latestChatPanelProps = null;

jest.mock('./ChatPanel', () => ({
  ChatPanel: (props) => {
    latestChatPanelProps = props;
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'chat-panel-mock' });
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

describe('MainLayout', () => {
  test('forwards chat props', () => {
    latestChatPanelProps = null;
    const ref = { current: null };
    const view = render(
      <MainLayout
        lastQuestion="q"
        answer="a"
        answerCacheMeta={{ hit: false, type: '' }}
        qaCacheDebug={{}}
        isLoading={false}
        queueStatus=""
        messagesEndRef={ref}
      />
    );

    expect(view.container.querySelector('[data-testid="chat-panel-mock"]')).toBeTruthy();
    expect(latestChatPanelProps).toEqual(
      expect.objectContaining({
        lastQuestion: 'q',
        answer: 'a',
        messagesEndRef: ref,
      })
    );

    view.unmount();
  });
});

