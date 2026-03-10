import { TtsBroadcastManager } from './TtsBroadcastManager';

function createMockManager() {
  return {
    _requestId: null,
    resetForRun: jest.fn(),
    stop: jest.fn(),
    markRagDone: jest.fn(),
    hasAnySegment: jest.fn(() => false),
    enqueueText: jest.fn((text, meta) => ({ text, meta })),
    enqueueWavBytes: jest.fn((wavBytes, meta) => ({ wavBytes, meta })),
    getStats: jest.fn(() => ({ textCount: 0, audioCount: 0 })),
    isBusy: jest.fn(() => false),
    ensureRunning: jest.fn(),
    waitForIdle: jest.fn().mockResolvedValue(undefined),
  };
}

function createSubject(mode = 'online') {
  const manager = new TtsBroadcastManager({ mode });
  const online = createMockManager();
  const local = createMockManager();
  manager._online = online;
  manager._local = local;
  return { manager, online, local };
}

describe('TtsBroadcastManager', () => {
  test('uses online mode by default and delegates queue operations', () => {
    const { manager, online, local } = createSubject();

    expect(manager.getMode()).toBe('online');

    manager.resetForRun({ requestId: 'rid-1' });
    manager.enqueueText('hello', { stopIndex: 1 });
    manager.markRagDone();
    manager.ensureRunning();

    expect(online.resetForRun).toHaveBeenCalledWith({ requestId: 'rid-1' });
    expect(local.resetForRun).toHaveBeenCalledWith({ requestId: 'rid-1' });
    expect(online.enqueueText).toHaveBeenCalledWith('hello', { stopIndex: 1 });
    expect(online.markRagDone).toHaveBeenCalledTimes(1);
    expect(online.ensureRunning).toHaveBeenCalledTimes(1);
  });

  test('switches mode and routes methods to local manager', () => {
    const { manager, online, local } = createSubject();

    manager.resetForRun({ requestId: 'rid-2' });
    manager.setMode('local', 'switch_to_local');

    expect(manager.getMode()).toBe('local');
    expect(online.stop).toHaveBeenCalledWith('switch_to_local');
    expect(local.resetForRun).toHaveBeenCalledWith({ requestId: 'rid-2' });

    manager.enqueueText('question');
    manager.stop('manual_stop');

    expect(local.enqueueText).toHaveBeenCalledWith('question', undefined);
    expect(local.stop).toHaveBeenCalledWith('manual_stop');
    expect(online.stop).toHaveBeenCalledWith('manual_stop');
  });

  test('enqueueWavBytes always targets online manager', () => {
    const { manager, online } = createSubject('local');
    const wav = new Uint8Array([1, 2, 3]);

    manager.enqueueWavBytes(wav, { seq: 9 });

    expect(online.enqueueWavBytes).toHaveBeenCalledWith(wav, { seq: 9 });
  });

  test('getStats includes active mode', () => {
    const { manager, online } = createSubject();
    online.getStats.mockReturnValue({ textCount: 3, audioCount: 2 });

    expect(manager.getStats()).toEqual({ textCount: 3, audioCount: 2, mode: 'online' });
  });
});

