import { createTtsOnStopIndexChange } from './createTtsOnStopIndexChange';

describe('createTtsOnStopIndexChange', () => {
  test('no-op when guide is disabled', () => {
    const pipeline = { setCurrentStopIndex: jest.fn() };
    const onStopIndexChange = createTtsOnStopIndexChange({
      guideEnabledRef: { current: false },
      tourStateRef: { current: { stopIndex: 0 } },
      tourPipelineRef: { current: pipeline },
    });

    onStopIndexChange(1);
    expect(pipeline.setCurrentStopIndex).not.toHaveBeenCalled();
  });

  test('syncs stop index, prefetches playback text and updates state cache', () => {
    const setAnswer = jest.fn();
    const setLastQuestion = jest.fn();
    const setTourState = jest.fn();
    const enqueueSegment = jest.fn();
    const ensureTtsRunning = jest.fn();
    const pipeline = {
      setCurrentStopIndex: jest.fn(),
      maybePrefetchFromPlayback: jest.fn(),
      getPrefetch: jest.fn().mockReturnValue({ answerText: 'cached answer' }),
    };
    const interruptManagerRef = {
      current: { snapshot: () => 1, isCurrent: () => true },
    };

    const onStopIndexChange = createTtsOnStopIndexChange({
      guideEnabledRef: { current: true },
      tourStateRef: { current: { stopIndex: 0 } },
      tourPipelineRef: { current: pipeline },
      ttsEnabledRef: { current: true },
      getTourStopName: () => 'Stop B',
      setTourState,
      setLastQuestion,
      buildTourPrompt: () => 'prompt-next',
      setAnswer,
      enqueueSegment,
      ensureTtsRunning,
      getPlaybackRecordingId: () => '',
      interruptManagerRef,
    });

    onStopIndexChange(1);

    expect(pipeline.setCurrentStopIndex).toHaveBeenCalledWith(1);
    expect(pipeline.maybePrefetchFromPlayback).toHaveBeenCalledTimes(1);
    const args = pipeline.maybePrefetchFromPlayback.mock.calls[0][0];
    args.enqueueSegment('seg-a', { stopIndex: 1 });
    args.ensureTtsRunning();
    expect(enqueueSegment).toHaveBeenCalledWith('seg-a', { stopIndex: 1 });
    expect(ensureTtsRunning).toHaveBeenCalledTimes(1);

    expect(setLastQuestion).toHaveBeenCalledWith('prompt-next');
    expect(setAnswer).toHaveBeenCalledWith('cached answer');
    expect(setTourState).toHaveBeenCalledWith(expect.any(Function));
    const nextState = setTourState.mock.calls[0][0]({
      mode: 'ready',
      stopIndex: 0,
      stopName: 'Stop A',
      lastAction: 'start',
    });
    expect(nextState).toEqual(
      expect.objectContaining({
        mode: 'running',
        stopIndex: 1,
        stopName: 'Stop B',
        lastAction: 'next',
      })
    );
  });

  test('uses recording playback prefetch and interrupt epoch gating', () => {
    const enqueueAudioSegment = jest.fn();
    const ensureTtsRunning = jest.fn();
    const pipeline = {
      setCurrentStopIndex: jest.fn(),
      maybePrefetchFromRecordingPlayback: jest.fn(),
      getPrefetch: jest.fn().mockReturnValue(null),
    };
    const interruptManagerRef = {
      current: { snapshot: () => 5, isCurrent: () => false },
    };

    const onStopIndexChange = createTtsOnStopIndexChange({
      guideEnabledRef: { current: true },
      tourStateRef: { current: { stopIndex: 0 } },
      tourPipelineRef: { current: pipeline },
      ttsEnabledRef: { current: true },
      setTourState: jest.fn(),
      setLastQuestion: jest.fn(),
      buildTourPrompt: () => 'p',
      setAnswer: jest.fn(),
      enqueueAudioSegment,
      ensureTtsRunning,
      getPlaybackRecordingId: () => 'recording-1',
      interruptManagerRef,
    });

    onStopIndexChange(1);
    expect(pipeline.maybePrefetchFromRecordingPlayback).toHaveBeenCalledTimes(1);
    const args = pipeline.maybePrefetchFromRecordingPlayback.mock.calls[0][0];

    args.enqueueAudioSegment('https://audio', { stopIndex: 1 });
    args.ensureTtsRunning();
    expect(enqueueAudioSegment).not.toHaveBeenCalled();
    expect(ensureTtsRunning).not.toHaveBeenCalled();
  });
});
