jest.mock('./VoiceKitWsRecorderManager', () => ({
  VoiceKitWsRecorderManager: jest.fn(),
}));

import { RecordingWorkflowManager } from './RecordingWorkflowManager';

describe('RecordingWorkflowManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-04T12:00:00+08:00'));
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
});
