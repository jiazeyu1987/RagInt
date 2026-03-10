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
});

