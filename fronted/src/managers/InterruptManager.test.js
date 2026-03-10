import { InterruptManager } from './InterruptManager';

describe('InterruptManager', () => {
  test('snapshot returns finite epoch and falls back to zero', () => {
    const mgrA = new InterruptManager({ current: 7 });
    const mgrB = new InterruptManager({ current: 'not_number' });

    expect(mgrA.snapshot()).toBe(7);
    expect(mgrB.snapshot()).toBe(0);
  });

  test('isCurrent compares with latest snapshot', () => {
    const epochRef = { current: 2 };
    const mgr = new InterruptManager(epochRef);

    expect(mgr.isCurrent(2)).toBe(true);
    expect(mgr.isCurrent(3)).toBe(false);
    expect(mgr.isCurrent('x')).toBe(false);
  });

  test('bump increments epoch and logs reason when provided', () => {
    const epochRef = { current: 10 };
    const mgr = new InterruptManager(epochRef);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const next = mgr.bump('manual_interrupt');

    expect(next).toBe(11);
    expect(epochRef.current).toBe(11);
    expect(logSpy).toHaveBeenCalledWith('[INTERRUPT_EPOCH] bump', 'manual_interrupt');

    logSpy.mockRestore();
  });
});

