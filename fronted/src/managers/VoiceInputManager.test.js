import { VoiceInputManager } from './VoiceInputManager';
import { PressToTalkAsrModule } from '../voice/PressToTalkAsrModule';

let mockLastModule = null;

jest.mock('../voice/PressToTalkAsrModule', () => ({
  PressToTalkAsrModule: function PressToTalkAsrModuleMock() {
    this.configure = jest.fn();
    this.startRecording = jest.fn().mockResolvedValue({ started: true });
    this.stopRecording = jest.fn();
    this.recordOnce = jest.fn().mockResolvedValue({ text: 'ok' });
    this.onRecordPointerDown = jest.fn().mockReturnValue('down');
    this.onRecordPointerUp = jest.fn().mockReturnValue('up');
    this.onRecordPointerCancel = jest.fn().mockReturnValue('cancel');
    this.dispose = jest.fn();
    mockLastModule = this;
  },
}));

describe('VoiceInputManager', () => {
  beforeEach(() => {
    mockLastModule = null;
  });

  test('delegates to PressToTalkAsrModule methods', async () => {
    const mgr = new VoiceInputManager({ onLog: jest.fn() });
    const module = mockLastModule;

    mgr.setRecordingDeps({ baseUrl: 'http://unit.test' });
    expect(module.configure).toHaveBeenCalledWith({ baseUrl: 'http://unit.test' });

    await expect(mgr.startRecording()).resolves.toEqual({ started: true });
    expect(module.startRecording).toHaveBeenCalledTimes(1);

    mgr.stopRecording();
    expect(module.stopRecording).toHaveBeenCalledTimes(1);

    await expect(mgr.recordOnce({ minMs: 600 })).resolves.toEqual({ text: 'ok' });
    expect(module.recordOnce).toHaveBeenCalledWith({ minMs: 600 });

    expect(mgr.onRecordPointerDown('e1')).toBe('down');
    expect(mgr.onRecordPointerUp('e2')).toBe('up');
    expect(mgr.onRecordPointerCancel()).toBe('cancel');
    expect(module.onRecordPointerDown).toHaveBeenCalledWith('e1');
    expect(module.onRecordPointerUp).toHaveBeenCalledWith('e2');
    expect(module.onRecordPointerCancel).toHaveBeenCalledTimes(1);
  });

  test('dispose exposes module disposal exceptions', () => {
    const mgr = new VoiceInputManager();
    const module = mockLastModule;
    module.dispose.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => mgr.dispose()).toThrow('boom');
  });
});
