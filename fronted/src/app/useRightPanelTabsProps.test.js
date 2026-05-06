import { renderHook } from '../testUtils/renderHook';
import { useRightPanelTabsProps } from './useRightPanelTabsProps';

describe('useRightPanelTabsProps', () => {
  test('passes history, debug, server, and queue props through unchanged', () => {
    const onChangeHistorySort = jest.fn();
    const onPickHistoryQuestion = jest.fn();
    const onAnswerQueuedNow = jest.fn();
    const onRemoveQueuedQuestion = jest.fn();
    const historyItems = [{ question: 'How old is the artifact?', ts: 1710000000000 }];
    const debugInfo = { requestId: 'req-1', stage: 'done' };
    const qaCacheDebug = { hit: true, key: 'cache-key' };
    const tourState = { mode: 'playing', stopIndex: 2 };
    const serverStatus = { status: 'ok', latencyMs: 24 };
    const serverStatusErr = new Error('status failed');
    const serverEvents = [{ id: 'evt-1', type: 'connected' }];
    const serverEventsErr = new Error('events failed');
    const serverLastError = new Error('last server error');
    const questionQueue = [{ id: 'q-1', question: 'Queued question' }];

    const hook = renderHook(() =>
      useRightPanelTabsProps({
        showHistoryPanel: true,
        historySort: 'newest',
        onChangeHistorySort,
        historyItems,
        onPickHistoryQuestion,
        showDebugPanel: true,
        debugInfo,
        qaCacheDebug,
        guideModeLabel: 'Realtime guide',
        ttsEnabled: false,
        tourState,
        serverStatus,
        serverStatusErr,
        serverEvents,
        serverEventsErr,
        serverLastError,
        questionQueue,
        onAnswerQueuedNow,
        onRemoveQueuedQuestion,
      })
    );

    expect(hook.result()).toEqual({
      showHistoryPanel: true,
      historySort: 'newest',
      onChangeHistorySort,
      historyItems,
      onPickHistoryQuestion,
      showDebugPanel: true,
      debugInfo,
      qaCacheDebug,
      guideModeLabel: 'Realtime guide',
      ttsEnabled: false,
      tourState,
      serverStatus,
      serverStatusErr,
      serverEvents,
      serverEventsErr,
      serverLastError,
      questionQueue,
      onAnswerQueuedNow,
      onRemoveQueuedQuestion,
    });

    expect(hook.result().onChangeHistorySort).toBe(onChangeHistorySort);
    expect(hook.result().onPickHistoryQuestion).toBe(onPickHistoryQuestion);
    expect(hook.result().onAnswerQueuedNow).toBe(onAnswerQueuedNow);
    expect(hook.result().onRemoveQueuedQuestion).toBe(onRemoveQueuedQuestion);
    expect(hook.result().serverStatus).toBe(serverStatus);
    expect(hook.result().serverStatusErr).toBe(serverStatusErr);
    expect(hook.result().serverEvents).toBe(serverEvents);
    expect(hook.result().serverEventsErr).toBe(serverEventsErr);
    expect(hook.result().serverLastError).toBe(serverLastError);
    expect(hook.result().questionQueue).toBe(questionQueue);

    hook.unmount();
  });
});
