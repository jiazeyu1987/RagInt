import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from './ChatPanel';

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

describe('ChatPanel', () => {
  test('renders question, cache-hit answer, loading and queue status', () => {
    const messagesEndRef = { current: null };
    const view = render(
      <ChatPanel
        lastQuestion="What is this?"
        answer="This is a demo."
        answerCacheMeta={{ hit: true, type: 'qa_audio' }}
        qaCacheDebug={{ confidence: 0.91234, pair_id: 123, reason: 'cache_hit' }}
        isLoading
        queueStatus="processing"
        messagesEndRef={messagesEndRef}
      />
    );

    expect(view.container.querySelector('.question-section')).toBeTruthy();
    expect(view.container.querySelector('.answer-section-cache-hit')).toBeTruthy();
    expect(view.container.querySelector('.answer-cache-badge')).toBeTruthy();
    expect(view.container.querySelector('.cache-debug-metrics').textContent).toContain('0.912');
    expect(view.container.querySelector('.cache-debug-metrics').textContent).toContain('123');
    expect(view.container.querySelector('.loading')).toBeTruthy();
    expect(view.container.querySelector('.queue-status').textContent).toContain('processing');
    expect(messagesEndRef.current).toBeTruthy();

    view.unmount();
  });
});

