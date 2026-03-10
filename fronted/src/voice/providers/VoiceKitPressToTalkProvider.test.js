let mockLastWorkflow = null;

jest.mock('../../managers/RecordingWorkflowManager', () => ({
  RecordingWorkflowManager: function RecordingWorkflowManagerMock() {
    this.setDeps = jest.fn();
    this.start = jest.fn().mockResolvedValue({ started: true });
    this.stop = jest.fn();
    this.recordOnce = jest.fn().mockResolvedValue({ text: 'hi' });
    this.onPointerDown = jest.fn().mockReturnValue('down');
    this.onPointerUp = jest.fn().mockReturnValue('up');
    this.onPointerCancel = jest.fn().mockReturnValue('cancel');
    this.cancel = jest.fn();
    mockLastWorkflow = this;
  },
}));

import { VoiceKitPressToTalkProvider } from './VoiceKitPressToTalkProvider';

describe('VoiceKitPressToTalkProvider', () => {
  beforeEach(() => {
    mockLastWorkflow = null;
  });

  test('constructs workflow and delegates methods', async () => {
    const provider = new VoiceKitPressToTalkProvider({ onLog: jest.fn() });
    const workflow = mockLastWorkflow;

    provider.configure({ baseUrl: 'http://unit.test' });
    expect(workflow.setDeps).toHaveBeenCalledWith({ baseUrl: 'http://unit.test' });

    await expect(provider.startCapture()).resolves.toEqual({ started: true });
    expect(workflow.start).toHaveBeenCalledTimes(1);

    provider.stopCapture();
    expect(workflow.stop).toHaveBeenCalledTimes(1);

    await expect(provider.recordOnce({ minMs: 500 })).resolves.toEqual({ text: 'hi' });
    expect(workflow.recordOnce).toHaveBeenCalledWith({ minMs: 500 });

    expect(provider.onPointerDown('evt1')).toBe('down');
    expect(provider.onPointerUp('evt2')).toBe('up');
    expect(provider.onPointerCancel()).toBe('cancel');
    expect(workflow.onPointerDown).toHaveBeenCalledWith('evt1');
    expect(workflow.onPointerUp).toHaveBeenCalledWith('evt2');
    expect(workflow.onPointerCancel).toHaveBeenCalledTimes(1);

    provider.dispose();
    expect(workflow.cancel).toHaveBeenCalledTimes(1);
  });
});

