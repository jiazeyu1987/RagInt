import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DebugPanel } from './DebugPanel';

jest.mock('../api/backendClient', () => ({
  backendUrl: (path) => `http://unit.test${path}`,
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

describe('DebugPanel', () => {
  test('renders timeline, route summary and queue actions', () => {
    const onAnswerQueuedNow = jest.fn();
    const onRemoveQueuedQuestion = jest.fn();
    const now = Date.now();

    const view = render(
      <DebugPanel
        embedded
        debugInfo={{
          requestId: 'req-1',
          trigger: 'tour_start',
          submitAt: now,
          segments: [{ seq: 1, chars: 20, ttsRequestAt: now + 10, ttsFirstAudioAt: now + 40, ttsDoneAt: now + 90 }],
        }}
        qaCacheDebug={{ lookup_enabled: true, hit: false, reason: 'classifier_confidence_below_threshold' }}
        guideModeLabel="recording"
        ttsEnabled
        tourState={{ mode: 'running', stopIndex: 1, stopName: 'Stop B' }}
        serverStatus={null}
        serverStatusErr={null}
        serverEvents={[
          { kind: 'app', name: 'ask_received', fields: { request_mode: 'tour', action_type: 'guide', tour_action: 'start' }, ts_ms: now + 1 },
          { kind: 'voice', name: 'asr_pending_asr_matched', ts_ms: now + 2, fields: { rawText: 'raw', correctedText: 'fixed' } },
          { kind: 'voice', name: 'asr_accepted', ts_ms: now + 30, fields: { finalText: 'final text' } },
        ]}
        serverEventsErr={null}
        serverLastError={null}
        questionQueue={[{ id: 'q1', speaker: 'u1', priority: 'high', text: 'question one' }]}
        onAnswerQueuedNow={onAnswerQueuedNow}
        onRemoveQueuedQuestion={onRemoveQueuedQuestion}
      />
    );

    expect(view.container.textContent).toContain('tour flow');
    expect(view.container.querySelector('.debug-asr-timeline')).toBeTruthy();
    expect(view.container.querySelector('a[href*="/api/events?request_id=req-1"]')).toBeTruthy();

    const queueButtons = view.container.querySelectorAll('.queue-btn');
    act(() => {
      queueButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      queueButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onAnswerQueuedNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }));
    expect(onRemoveQueuedQuestion).toHaveBeenCalledWith('q1');

    view.unmount();
  });
});

