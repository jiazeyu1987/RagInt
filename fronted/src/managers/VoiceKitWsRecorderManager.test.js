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

  test('fails fast when explicit timing config is invalid', () => {
    expect(
      () =>
        new VoiceKitWsRecorderManager({
          stopGraceMs: 'slow',
        })
    ).toThrow('invalid_voicekit_numeric_config:stopGraceMs');

    expect(
      () =>
        new VoiceKitWsRecorderManager({
          finalWaitMs: 50,
        })
    ).toThrow('invalid_voicekit_numeric_config:finalWaitMs');
  });

  test('fails fast when explicit wake config is invalid', async () => {
    const onError = jest.fn();
    const recorder = new VoiceKitWsRecorderManager({
      startPayload: {
        wake_word_enabled: true,
        wake_word: 'hello',
        wake_match_mode: 'middle',
      },
      onError,
    });

    await expect(recorder.start()).rejects.toThrow('invalid_voicekit_wake_match_mode');
    expect(recorder.isRecording).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      'Failed to start VoiceKit ASR',
      expect.objectContaining({ message: 'invalid_voicekit_wake_match_mode' })
    );
    expect(createMicRecorder).not.toHaveBeenCalled();
    expect(createVoiceInputManager).not.toHaveBeenCalled();
  });

  test('stop keeps sending tail frames during grace window', async () => {
    let onFrame = null;
    let onFinal = null;
    const micStop = jest.fn();
    const sendAudioFrame = jest.fn();
    const stopHoldToTalk = jest.fn();
    const recognizingStates = [];

    createMicRecorder.mockImplementation((options) => {
      onFrame = options.onFrame;
      return {
        start: jest.fn().mockResolvedValue(undefined),
        stop: micStop,
      };
    });

    createVoiceInputManager.mockImplementation((options) => {
      onFinal = options.onFinal;
      return {
        startHoldToTalk: jest.fn().mockResolvedValue(undefined),
        stopHoldToTalk,
        sendAudioFrame,
        dispose: jest.fn(),
      };
    });

    const recorder = new VoiceKitWsRecorderManager({
      baseUrl: 'ws://unit.test',
      clientId: 'client-test',
      onRecognizingChange: (value) => recognizingStates.push(!!value),
    });

    await recorder.start();

    expect(recognizingStates).toEqual([false, true]);

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
    expect(recognizingStates).toEqual([false, true]);

    jest.advanceTimersByTime(1);
    expect(stopHoldToTalk).toHaveBeenCalledTimes(1);
    expect(micStop).toHaveBeenCalledTimes(1);
    expect(recognizingStates).toEqual([false, true]);

    onFinal('done');
    expect(recognizingStates).toEqual([false, true, false]);
  });

  test('stop exposes hold-to-talk stop failures', async () => {
    const stopError = new Error('voicekit_stop_failed');
    const onError = jest.fn();
    const onStateChange = jest.fn();
    const onRecognizingChange = jest.fn();
    const micStop = jest.fn();
    const dispose = jest.fn();
    createMicRecorder.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: micStop,
    }));
    createVoiceInputManager.mockImplementation(() => ({
      startHoldToTalk: jest.fn().mockResolvedValue(undefined),
      stopHoldToTalk: jest.fn(() => {
        throw stopError;
      }),
      sendAudioFrame: jest.fn(),
      dispose,
    }));

    const recorder = new VoiceKitWsRecorderManager({
      stopGraceMs: 10,
      onError,
      onStateChange,
      onRecognizingChange,
    });

    await recorder.start();

    recorder.stop();
    expect(() => jest.advanceTimersByTime(10)).not.toThrow();

    expect(onError).toHaveBeenCalledWith('voicekit_stop_hold_to_talk_failed', stopError);
    expect(micStop).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith(false);
    expect(onRecognizingChange).toHaveBeenLastCalledWith(false);
  });

  test('stop reports final timeout when no final result arrives', async () => {
    const onFinalTimeout = jest.fn();
    const onError = jest.fn();
    createMicRecorder.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
    }));
    createVoiceInputManager.mockImplementation(() => ({
      startHoldToTalk: jest.fn().mockResolvedValue(undefined),
      stopHoldToTalk: jest.fn(),
      sendAudioFrame: jest.fn(),
      dispose: jest.fn(),
    }));

    const recorder = new VoiceKitWsRecorderManager({
      stopGraceMs: 10,
      finalWaitMs: 200,
      onFinalTimeout,
      onError,
    });

    await recorder.start();
    recorder.stop();

    jest.advanceTimersByTime(10);
    jest.runOnlyPendingTimers();

    expect(onError).toHaveBeenCalledWith(
      'voicekit_final_wait_timeout',
      expect.objectContaining({ reason: 'final_wait_timeout' })
    );
    expect(onFinalTimeout).toHaveBeenCalledWith('', { reason: 'final_wait_timeout' });
  });
});
