jest.mock('./VoiceKitWsRecorderManager', () => ({
  VoiceKitWsRecorderManager: jest.fn(),
}));
jest.mock('./SaucWsRecorderManager', () => ({
  SaucWsRecorderManager: jest.fn(),
}));
jest.mock('voicekit-js', () => ({
  createMicRecorder: jest.fn(),
}));

import { RecordingWorkflowManager } from './RecordingWorkflowManager';
import { VoiceKitWsRecorderManager } from './VoiceKitWsRecorderManager';
import { SaucWsRecorderManager } from './SaucWsRecorderManager';

describe('RecordingWorkflowManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00+08:00'));
    VoiceKitWsRecorderManager.mockReset();
    SaucWsRecorderManager.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function createWorkflow(minRecordMs = 900) {
    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      minRecordMs,
      setIsLoading: jest.fn(),
      unlockAudio: jest.fn(),
    });
    workflow._recorder = {
      stop: jest.fn(),
      cancel: jest.fn(),
      isRecording: true,
    };
    workflow._recordStartedAtMs = Date.now();
    return workflow;
  }

  test('stop waits until minimum record duration before stopping recorder', () => {
    const workflow = createWorkflow(900);
    const recorder = workflow._recorder;

    jest.advanceTimersByTime(200);
    workflow.stop();

    expect(recorder.stop).not.toHaveBeenCalled();

    jest.advanceTimersByTime(699);
    expect(recorder.stop).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  test('stop happens immediately once minimum duration already passed', () => {
    const workflow = createWorkflow(900);
    const recorder = workflow._recorder;

    jest.advanceTimersByTime(950);
    workflow.stop();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  test('composeLiveInputText preserves user-appended suffix while ASR finalizes', () => {
    let currentInput = 'base text partial result user suffix';
    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      getInputText: () => currentInput,
    });
    workflow._wsBaseText = 'base text';
    workflow._session.reset('base text');
    workflow._session.setLastAppliedInputText('base text partial result');

    expect(workflow._composeLiveInputText('final result')).toBe('base text final result user suffix');
  });

  test('final timeout keeps partial text when strategy is keep_partial', () => {
    let recorderConfig = null;
    VoiceKitWsRecorderManager.mockImplementation((config) => {
      recorderConfig = config;
      return {
        stop: jest.fn(),
        cancel: jest.fn(),
        isRecording: true,
      };
    });

    const setInputText = jest.fn();
    const onFinalText = jest.fn();
    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      baseUrl: 'http://localhost:9380',
      clientId: 'client-1',
      setInputText,
      getInputText: () => 'base text',
      onFinalText,
      asrFinalTimeoutStrategy: 'keep_partial',
    });
    workflow._snapshotBaseText();
    workflow._ensureRecorder();

    recorderConfig.onPartialText('partial text');
    recorderConfig.onFinalTimeout('timeout fallback ignored');

    expect(setInputText).toHaveBeenLastCalledWith('base text partial text');
    expect(onFinalText).toHaveBeenCalledWith('partial text');
  });

  test('final timeout restores base input when strategy is clear_input', () => {
    let recorderConfig = null;
    VoiceKitWsRecorderManager.mockImplementation((config) => {
      recorderConfig = config;
      return {
        stop: jest.fn(),
        cancel: jest.fn(),
        isRecording: true,
      };
    });

    const setInputText = jest.fn();
    const onFinalText = jest.fn();
    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      baseUrl: 'http://localhost:9380',
      clientId: 'client-1',
      setInputText,
      getInputText: () => 'base text',
      onFinalText,
      asrFinalTimeoutStrategy: 'clear_input',
    });
    workflow._snapshotBaseText();
    workflow._ensureRecorder();

    recorderConfig.onPartialText('partial text');
    recorderConfig.onFinalTimeout('timeout fallback ignored');

    expect(setInputText).toHaveBeenLastCalledWith('base text');
    expect(onFinalText).toHaveBeenCalledWith('');
  });

  test('accumulates transcript across segmented partial and final events', () => {
    let recorderConfig = null;
    VoiceKitWsRecorderManager.mockImplementation((config) => {
      recorderConfig = config;
      return {
        stop: jest.fn(),
        cancel: jest.fn(),
        isRecording: true,
      };
    });

    let currentInput = 'base text';
    const setInputText = jest.fn((value) => {
      currentInput = value;
    });
    const onFinalText = jest.fn();
    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      baseUrl: 'http://localhost:9380',
      clientId: 'client-1',
      setInputText,
      getInputText: () => currentInput,
      onFinalText,
    });
    workflow._snapshotBaseText();
    workflow._ensureRecorder();

    recorderConfig.onPartialText('today weather is nice');
    recorderConfig.onPartialText('i will go to the supermarket');
    recorderConfig.onFinalText('buy some things');

    expect(setInputText).toHaveBeenLastCalledWith(
      'base text today weather is nice i will go to the supermarket buy some things'
    );
    expect(onFinalText).toHaveBeenCalledWith('today weather is nice i will go to the supermarket buy some things');
  });

  test('replaces cumulative SAUC transcript updates instead of appending duplicate revisions', () => {
    let recorderConfig = null;
    SaucWsRecorderManager.mockImplementation((config) => {
      recorderConfig = config;
      return {
        stop: jest.fn(),
        cancel: jest.fn(),
        isRecording: true,
      };
    });

    let currentInput = 'base text';
    const setInputText = jest.fn((value) => {
      currentInput = value;
    });
    const onFinalText = jest.fn();
    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      providerType: 'sauc_ws',
      baseUrl: 'http://localhost:8000',
      clientId: 'client-1',
      saucWsUrl: 'wss://example.test/sauc',
      saucResourceId: 'rid',
      saucAppKey: 'app-key',
      saucAccessKey: 'access-key',
      setInputText,
      getInputText: () => currentInput,
      onFinalText,
    });
    workflow._snapshotBaseText();
    workflow._ensureRecorder();

    recorderConfig.onPartialText('2×2=4');
    recorderConfig.onPartialText('2乘以2=4，就像你有两个小球，再复制一份');
    recorderConfig.onFinalText('2乘以2等于4，就像你有两个小球，再复制一份，总共就有4个小球了');

    expect(setInputText).toHaveBeenLastCalledWith(
      'base text 2乘以2等于4，就像你有两个小球，再复制一份，总共就有4个小球了'
    );
    expect(onFinalText).toHaveBeenCalledWith(
      '2乘以2等于4，就像你有两个小球，再复制一份，总共就有4个小球了'
    );
  });
  test('start exposes recorder startup failures instead of returning false', async () => {
    VoiceKitWsRecorderManager.mockImplementation(() => ({
      start: jest.fn().mockRejectedValue(new Error('mic_permission_denied')),
      stop: jest.fn(),
      cancel: jest.fn(),
      isRecording: false,
    }));

    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      baseUrl: 'http://localhost:9380',
      clientId: 'client-1',
      setIsLoading: jest.fn(),
      onRecognizingChange: jest.fn(),
      onAsrStageChange: jest.fn(),
    });

    await expect(workflow.start()).rejects.toThrow('mic_permission_denied');
  });

  test('start exposes status write failures instead of pretending capture started', async () => {
    const setIsLoading = jest.fn(() => {
      throw new Error('loading_state_write_failed');
    });
    VoiceKitWsRecorderManager.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(true),
      stop: jest.fn(),
      cancel: jest.fn(),
      isRecording: false,
    }));

    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      baseUrl: 'http://localhost:9380',
      clientId: 'client-1',
      setIsLoading,
      onRecognizingChange: jest.fn(),
      onAsrStageChange: jest.fn(),
    });

    await expect(workflow.start()).rejects.toThrow('loading_state_write_failed');
  });

  test('stop exposes recorder stop failures instead of reporting a completed stop', () => {
    const workflow = createWorkflow(0);
    workflow._recorder.stop.mockImplementation(() => {
      throw new Error('recorder_stop_failed');
    });

    expect(() => workflow.stop()).toThrow('recorder_stop_failed');
  });

  test('recordOnce rejects when final text never arrives instead of returning empty success', async () => {
    VoiceKitWsRecorderManager.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(true),
      stop: jest.fn(),
      cancel: jest.fn(),
      isRecording: false,
    }));

    const workflow = new RecordingWorkflowManager();
    workflow.setDeps({
      baseUrl: 'http://localhost:9380',
      clientId: 'client-1',
      setIsLoading: jest.fn(),
      onRecognizingChange: jest.fn(),
      onAsrStageChange: jest.fn(),
    });

    const pending = workflow.recordOnce({ maxRecordMs: 500, totalTimeoutMs: 1200 });
    await Promise.resolve();
    jest.advanceTimersByTime(1200);

    await expect(pending).rejects.toThrow('record_once_timeout');
  });
});
