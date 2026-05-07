import { act } from 'react';
import { getBreakpoint, setBreakpoint } from '../api/breakpoint';
import { renderHook } from '../testUtils/renderHook';
import { useBreakpointSync } from './useBreakpointSync';

jest.mock('../api/breakpoint', () => ({
  getBreakpoint: jest.fn(),
  setBreakpoint: jest.fn(),
}));

describe('useBreakpointSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getBreakpoint.mockReset();
    setBreakpoint.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('restores breakpoint once and calls onRestore', async () => {
    getBreakpoint.mockResolvedValueOnce({
      ok: true,
      state: { mode: 'running', stopIndex: 2 },
    });
    const onRestore = jest.fn();

    const hook = renderHook((props) => useBreakpointSync(props), {
      clientId: 'client-1',
      kind: 'tour',
      enabled: true,
      state: { mode: 'idle' },
      onRestore,
    });

    await hook.flush();

    expect(getBreakpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        kind: 'tour',
      })
    );
    expect(onRestore).toHaveBeenCalledWith({ mode: 'running', stopIndex: 2 }, expect.any(Object));
    hook.unmount();
  });

  test('saves state changes after debounce when restore has completed', async () => {
    getBreakpoint.mockResolvedValueOnce({ ok: true, state: { mode: 'idle' } });
    setBreakpoint.mockResolvedValueOnce({ ok: true });

    const hook = renderHook((props) => useBreakpointSync(props), {
      clientId: 'client-2',
      kind: 'tour',
      enabled: true,
      debounceMs: 300,
      state: { mode: 'idle' },
    });

    await hook.flush();

    hook.updateProps({ state: { mode: 'running', stopIndex: 1 } });

    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(setBreakpoint).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    await hook.flush();

    expect(setBreakpoint).toHaveBeenCalledWith({
      clientId: 'client-2',
      kind: 'tour',
      state: { mode: 'running', stopIndex: 1 },
    });
    hook.unmount();
  });

  test('surfaces restore failures and does not save until restore succeeds', async () => {
    getBreakpoint.mockRejectedValueOnce(new Error('breakpoint_store_down'));
    setBreakpoint.mockResolvedValueOnce({ ok: true });
    const onError = jest.fn();

    const hook = renderHook((props) => useBreakpointSync(props), {
      clientId: 'client-3',
      kind: 'tour',
      enabled: true,
      debounceMs: 300,
      state: { mode: 'idle' },
      onError,
    });

    await hook.flush();
    hook.updateProps({ state: { mode: 'running' } });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    await hook.flush();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'restore',
        error: expect.any(Error),
      })
    );
    expect(onError.mock.calls[0][0].error.message).toBe('breakpoint_store_down');
    expect(setBreakpoint).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('surfaces invalid restore responses instead of treating them as restored', async () => {
    getBreakpoint.mockResolvedValueOnce({ ok: false, error: 'breakpoint_load_failed' });
    const onError = jest.fn();

    const hook = renderHook((props) => useBreakpointSync(props), {
      clientId: 'client-4',
      kind: 'tour',
      enabled: true,
      state: { mode: 'idle' },
      onError,
    });

    await hook.flush();

    expect(onError.mock.calls[0][0].phase).toBe('restore');
    expect(onError.mock.calls[0][0].error.message).toBe('breakpoint_load_failed');
    hook.unmount();
  });

  test('surfaces save failures and retries unchanged state on the next render', async () => {
    getBreakpoint.mockResolvedValueOnce({ ok: true, state: { mode: 'idle' } });
    setBreakpoint.mockRejectedValueOnce(new Error('breakpoint_save_down'));
    setBreakpoint.mockResolvedValueOnce({ ok: true });
    const onError = jest.fn();

    const hook = renderHook((props) => useBreakpointSync(props), {
      clientId: 'client-5',
      kind: 'tour',
      enabled: true,
      debounceMs: 300,
      state: { mode: 'idle' },
      onError,
    });

    await hook.flush();
    hook.updateProps({ state: { mode: 'running' } });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    await hook.flush();

    expect(onError.mock.calls[0][0].phase).toBe('save');
    expect(onError.mock.calls[0][0].error.message).toBe('breakpoint_save_down');
    expect(setBreakpoint).toHaveBeenCalledTimes(1);

    hook.updateProps({ state: { mode: 'running' } });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    await hook.flush();

    expect(setBreakpoint).toHaveBeenCalledTimes(2);
    expect(setBreakpoint).toHaveBeenLastCalledWith({
      clientId: 'client-5',
      kind: 'tour',
      state: { mode: 'running' },
    });
    hook.unmount();
  });
});

