import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useVoiceInputManager } from './useVoiceInputManager';

const mockState = {
  lastInstance: null,
};

jest.mock('../voice/PressToTalkAsrModule', () => ({
  PressToTalkAsrModule: function PressToTalkAsrModuleMock() {
    this.configure = jest.fn();
    this.dispose = jest.fn();
    this.startCapture = jest.fn().mockResolvedValue({ started: true });
    this.stopCapture = jest.fn();
    this.recordOnce = jest.fn().mockResolvedValue({ text: 'once' });
    this.onPointerDown = jest.fn().mockResolvedValue(undefined);
    this.onPointerUp = jest.fn();
    this.onPointerCancel = jest.fn();
    mockState.lastInstance = this;
  },
}));

describe('useVoiceInputManager', () => {
  beforeEach(() => {
    mockState.lastInstance = null;
  });

  test('configures module and forwards start/stop/pointer handlers', async () => {
    const props = {
      providerType: 'voicekit_ws',
      baseUrl: 'http://unit.test',
      minRecordMs: 900,
      asrStopGraceMs: 480,
      asrFinalWaitMs: 1500,
      asrFinalTimeoutStrategy: 'keep_partial',
      clientIdRef: { current: 'cid' },
      setInputText: jest.fn(),
      getInputText: jest.fn().mockReturnValue('draft'),
      setIsLoading: jest.fn(),
      decodeAndConvertToWav16kMono: jest.fn(),
      unlockAudio: jest.fn(),
      ttsEnabledRef: { current: true },
      audioContextRef: { current: null },
      wakeWordEnabled: true,
      wakeWord: 'hello assistant',
      wakeWordStrict: false,
      wakeWordCooldownMs: 5000,
      saucWsUrl: '',
      saucResourceId: '',
      saucAppKey: '',
      saucAccessKey: '',
      saucModelName: '',
      saucSegmentDurationMs: 200,
      saucEnableItn: true,
      saucEnablePunc: true,
      saucEnableDdc: true,
      saucShowUtterances: true,
      saucEnableNonstream: false,
      onWakeWordFeedback: jest.fn(),
      onAsrFinalText: jest.fn(),
      askQuestion: jest.fn(),
      submitText: jest.fn(),
      isLoading: false,
    };

    const hook = renderHook((p) => useVoiceInputManager(p), props);
    const manager = mockState.lastInstance;

    expect(manager.configure).toHaveBeenCalledTimes(1);
    const cfg = manager.configure.mock.calls[0][0];
    expect(cfg.clientId).toBe('cid');
    expect(cfg.wsRequireWake).toBe(false);
    expect(cfg.onFinalText).toBe(props.onAsrFinalText);
    expect(cfg.onWakeWordFeedback).toBe(props.onWakeWordFeedback);
    expect(cfg.onCaptureChange).toEqual(expect.any(Function));
    expect(cfg.onRecognizingChange).toEqual(expect.any(Function));
    expect(cfg.onAsrStageChange).toEqual(expect.any(Function));

    await expect(hook.result().startRecording()).resolves.toEqual({ started: true });
    expect(manager.startCapture).toHaveBeenCalledTimes(1);

    hook.result().stopRecording();
    expect(manager.stopCapture).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.result().onRecordPointerDown('evt-down');
    });
    expect(manager.onPointerDown).toHaveBeenCalledWith('evt-down');

    act(() => {
      hook.result().onRecordPointerUp('evt-up');
      hook.result().onRecordPointerCancel();
    });
    expect(manager.onPointerUp).toHaveBeenCalledWith('evt-up');
    expect(manager.onPointerCancel).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  test('disposes module on unmount', () => {
    const hook = renderHook((p) => useVoiceInputManager(p), {
      clientIdRef: { current: 'cid' },
      setInputText: jest.fn(),
    });
    const manager = mockState.lastInstance;
    hook.unmount();
    expect(manager.dispose).toHaveBeenCalledTimes(1);
  });

  test('fails fast when required voice input dependencies are missing', () => {
    expect(() =>
      renderHook((p) => useVoiceInputManager(p), {
        baseUrl: 'http://unit.test',
        clientIdRef: { current: 'cid' },
      })
    ).toThrow('useVoiceInputManager requires setInputText');
  });
});
