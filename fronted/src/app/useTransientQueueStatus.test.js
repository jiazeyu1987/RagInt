import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useTransientQueueStatus } from './useTransientQueueStatus';

describe('useTransientQueueStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows a transient status and clears it after the timeout', () => {
    const hook = renderHook(() => useTransientQueueStatus());

    act(() => {
      hook.result().showTransientQueueStatus('  已检测到唤醒词  ', 300);
    });
    expect(hook.result().queueStatus).toBe('已检测到唤醒词');

    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(hook.result().queueStatus).toBe('已检测到唤醒词');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(hook.result().queueStatus).toBe('');
  });

  test('ignores empty transient messages without replacing the current status', () => {
    const hook = renderHook(() => useTransientQueueStatus());

    act(() => {
      hook.result().setQueueStatus('正在处理');
      hook.result().showTransientQueueStatus('   ');
    });

    expect(hook.result().queueStatus).toBe('正在处理');
  });

  test('clears the active timeout on unmount', () => {
    const hook = renderHook(() => useTransientQueueStatus());

    act(() => {
      hook.result().showTransientQueueStatus('临时提示', 500);
    });

    hook.unmount();

    act(() => {
      jest.advanceTimersByTime(500);
    });
  });

  test('rejects invalid explicit duration instead of letting the browser coerce it', () => {
    const hook = renderHook(() => useTransientQueueStatus('idle'));

    expect(() => {
      act(() => {
        hook.result().showTransientQueueStatus('bad duration', Number.NaN);
      });
    }).toThrow('transient_queue_status_duration_invalid');
    expect(hook.result().queueStatus).toBe('idle');
  });
});
