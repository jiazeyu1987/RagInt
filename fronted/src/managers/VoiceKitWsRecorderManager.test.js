jest.mock('voicekit-js', () => ({
  createMicRecorder: jest.fn(),
  createVoiceInputManager: jest.fn(),
}));

import { createMicRecorder, createVoiceInputManager } from 'voicekit-js';
import { VoiceKitWsRecorderManager } from './VoiceKitWsRecorderManager';

describe('VoiceKitWsRecorderManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: jest.fn(),
        },
      },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('stop keeps sending tail frames during grace window', async () => {
    let onFrame = null;
    const micStop = jest.fn();
    const sendAudioFrame = jest.fn();
    const stopHoldToTalk = jest.fn();

    createMicRecorder.mockImplementation((options) => {
      onFrame = options.onFrame;
      return {
        start: jest.fn().mockResolvedValue(undefined),
        stop: micStop,
      };
    });

    createVoiceInputManager.mockReturnValue({
      startHoldToTalk: jest.fn().mockResolvedValue(undefined),
      stopHoldToTalk,
      sendAudioFrame,
      dispose: jest.fn(),
    });

    const recorder = new VoiceKitWsRecorderManager({
      baseUrl: 'ws://unit.test',
      clientId: 'client-test',
    });

    await recorder.start();

    const frameA = new ArrayBuffer(8);
    onFrame(frameA);
    expect(sendAudioFrame).toHaveBeenCalledTimes(1);

    recorder.stop();

    const frameB = new ArrayBuffer(8);
    onFrame(frameB);
    expect(sendAudioFrame).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(479);
    expect(stopHoldToTalk).not.toHaveBeenCalled();
    expect(micStop).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(stopHoldToTalk).toHaveBeenCalledTimes(1);
    expect(micStop).toHaveBeenCalledTimes(1);
  });
});
