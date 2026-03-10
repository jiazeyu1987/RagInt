import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useRecorderWorkflow } from './useRecorderWorkflow';

let mockRecorderInstances = [];

jest.mock('../managers/RecordingWorkflowManager', () => ({
  RecordingWorkflowManager: function RecordingWorkflowManagerMock() {
    this.setDeps = jest.fn();
    this.start = jest.fn().mockResolvedValue({ started: true });
    this.stop = jest.fn();
    this.recordOnce = jest.fn().mockResolvedValue({ ok: true });
    this.onPointerDown = jest.fn().mockResolvedValue(undefined);
    this.onPointerUp = jest.fn();
    this.onPointerCancel = jest.fn();
    mockRecorderInstances.push(this);
  },
}));

describe('useRecorderWorkflow', () => {
  beforeEach(() => {
    mockRecorderInstances = [];
  });

  test('binds manager deps and forwards operations', async () => {
    const hook = renderHook((p) => useRecorderWorkflow(p), {
      baseUrl: 'http://unit.test',
      minRecordMs: 800,
      clientIdRef: { current: 'cid-1' },
      setInputText: jest.fn(),
      getInputText: jest.fn(() => ''),
      setIsLoading: jest.fn(),
      decodeAndConvertToWav16kMono: jest.fn(),
      unlockAudio: jest.fn(),
      ttsEnabledRef: { current: true },
      audioContextRef: { current: null },
    });

    expect(mockRecorderInstances).toHaveLength(1);
    expect(mockRecorderInstances[0].setDeps).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://unit.test',
        minRecordMs: 800,
        clientId: 'cid-1',
      })
    );

    await act(async () => {
      await hook.result().startRecording();
      await hook.result().recordOnce({ maxRecordMs: 1000, totalTimeoutMs: 3000 });
      await hook.result().onRecordPointerDown({ type: 'pointerdown' });
    });
    act(() => {
      hook.result().stopRecording();
      hook.result().onRecordPointerUp({ type: 'pointerup' });
      hook.result().onRecordPointerCancel();
    });

    expect(mockRecorderInstances[0].start).toHaveBeenCalledTimes(1);
    expect(mockRecorderInstances[0].recordOnce).toHaveBeenCalledWith({ maxRecordMs: 1000, totalTimeoutMs: 3000 });
    expect(mockRecorderInstances[0].onPointerDown).toHaveBeenCalledWith({ type: 'pointerdown' });
    expect(mockRecorderInstances[0].stop).toHaveBeenCalledTimes(1);
    expect(mockRecorderInstances[0].onPointerUp).toHaveBeenCalledWith({ type: 'pointerup' });
    expect(mockRecorderInstances[0].onPointerCancel).toHaveBeenCalledTimes(1);

    hook.unmount();
  });
});

