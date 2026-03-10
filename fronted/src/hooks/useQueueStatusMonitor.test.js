import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useQueueStatusMonitor } from './useQueueStatusMonitor';

describe('useQueueStatusMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('periodically publishes queue status while current run is active', () => {
    const setQueueStatus = jest.fn();
    const mgr = {
      getStats: jest.fn(() => ({
        textCount: 2,
        audioCount: 1,
        generatorRunning: true,
        playerRunning: false,
      })),
      isBusy: jest.fn(() => true),
    };
    const requestSeqRef = { current: 7 };

    const hook = renderHook((props) => useQueueStatusMonitor(props), {
      ttsManagerRef: { current: mgr },
      requestSeqRef,
      getIsLoading: () => true,
      setQueueStatus,
    });

    act(() => {
      hook.result().startStatusMonitor(7);
    });

    act(() => {
      jest.advanceTimersByTime(220);
    });

    expect(setQueueStatus).toHaveBeenCalled();
    const statusText = setQueueStatus.mock.calls[0][0];
    expect(typeof statusText).toBe('string');
    expect(statusText).toContain('2');
    expect(statusText).toContain('1');
    hook.unmount();
  });

  test('clears status and stops monitor when run id is not current', () => {
    const setQueueStatus = jest.fn();
    const requestSeqRef = { current: 1 };
    const hook = renderHook((props) => useQueueStatusMonitor(props), {
      ttsManagerRef: {
        current: {
          getStats: () => ({ textCount: 1, audioCount: 0, generatorRunning: false, playerRunning: false }),
          isBusy: () => false,
        },
      },
      requestSeqRef,
      getIsLoading: () => false,
      setQueueStatus,
    });

    act(() => {
      hook.result().startStatusMonitor(1);
    });

    requestSeqRef.current = 2;
    act(() => {
      jest.advanceTimersByTime(220);
    });

    expect(setQueueStatus).toHaveBeenLastCalledWith('');
    hook.unmount();
  });
});

