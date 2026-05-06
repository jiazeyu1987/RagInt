import { TourController } from './TourController';
import { RUN_REASON } from './RunReasons';

function makeBaseDeps(overrides = {}) {
  const deps = {
    ttsEnabledRef: { current: false },
    audioContextRef: { current: null },
    preferredTtsSampleRate: 16000,
    unlockAudio: jest.fn(),
    interruptCurrentRun: jest.fn(),
    interruptManagerRef: { current: { snapshot: () => 1, isCurrent: () => true } },
    tourResumeRef: { current: { old: true } },
    continuousTourRef: { current: false },
    buildTourPrompt: jest.fn(() => 'start_prompt'),
    beginDebugRun: jest.fn(),
    askQuestion: jest.fn().mockResolvedValue(''),
    playTourRecordingEnabledRef: { current: false },
    selectedTourRecordingIdRef: { current: '' },
    setPlayTourRecordingEnabled: jest.fn(),
    setSelectedTourRecordingId: jest.fn(),
    tourRecordingEnabledRef: { current: false },
    activeTourRecordingIdRef: { current: 'rid_old' },
    startTourRecordingArchive: jest.fn().mockResolvedValue(''),
    loadTourRecordingMeta: jest.fn().mockResolvedValue(null),
    ragflowChatManager: { createNewSession: jest.fn().mockResolvedValue({ ok: true }) },
    fetchJson: jest.fn().mockResolvedValue({
      stops: ['Stop A', 'Stop B'],
      stop_durations_s: [30, 60],
      stop_target_chars: [120, 240],
    }),
    tourZoneRef: { current: 'Default Zone' },
    audienceProfileRef: { current: 'General' },
    guideDurationRef: { current: '60' },
    tourMetaRef: { current: { default_zone: 'Default Zone', default_profile: 'General' } },
    tourStopsOverrideRef: { current: [] },
    tourStopDurationsOverrideRef: { current: {} },
    setTourStops: jest.fn(),
    setTourStopDurations: jest.fn(),
    setTourStopTargetChars: jest.fn(),
    tourStopDurationsRef: { current: [] },
    tourStopTargetCharsRef: { current: [] },
    getTourStops: () => ['Stop A', 'Stop B'],
    getTourPipeline: () => ({ startContinuousTour: jest.fn().mockResolvedValue(undefined) }),
    ...overrides,
  };
  return deps;
}

describe('TourController', () => {
  test('start in non-continuous mode asks with built prompt', async () => {
    const deps = makeBaseDeps({ continuousTourRef: { current: false } });
    const c = new TourController(deps);

    await c.start();

    expect(deps.interruptCurrentRun).toHaveBeenCalledWith(RUN_REASON.TOUR_START);
    expect(deps.tourResumeRef.current).toEqual({});
    expect(deps.buildTourPrompt).toHaveBeenCalledWith('start', 0);
    expect(deps.beginDebugRun).toHaveBeenCalledWith('guide_start');
    expect(deps.askQuestion).toHaveBeenCalledWith('start_prompt', { tourAction: 'start', tourStopIndex: 0 });
  });

  test('start in continuous mode delegates to tour pipeline', async () => {
    const startContinuousTour = jest.fn().mockResolvedValue(undefined);
    const deps = makeBaseDeps({
      continuousTourRef: { current: true },
      getTourPipeline: () => ({ startContinuousTour }),
    });
    const c = new TourController(deps);

    await c.start();

    expect(startContinuousTour).toHaveBeenCalledTimes(1);
    const arg = startContinuousTour.mock.calls[0][0];
    expect(arg.startIndex).toBe(0);
    expect(arg.firstAction).toBe('start');
    expect(Array.isArray(arg.stopsOverride)).toBe(true);
    expect(deps.askQuestion).not.toHaveBeenCalledWith('start_prompt', expect.anything());
  });

  test('start fetches plan and updates stop durations/targets', async () => {
    const deps = makeBaseDeps();
    const c = new TourController(deps);

    await c.start();

    expect(deps.fetchJson).toHaveBeenCalledWith(
      '/api/tour/plan',
      expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    );
    expect(deps.setTourStops).toHaveBeenCalledWith(['Stop A', 'Stop B']);
    expect(deps.setTourStopDurations).toHaveBeenCalledWith([30, 60]);
    expect(deps.setTourStopTargetChars).toHaveBeenCalledWith([120, 240]);
    expect(deps.tourStopDurationsRef.current).toEqual([30, 60]);
    expect(deps.tourStopTargetCharsRef.current).toEqual([120, 240]);
  });

  test('start sends stop duration overrides to /api/tour/plan', async () => {
    const deps = makeBaseDeps({
      tourStopDurationsOverrideRef: { current: { A: 12, B: '34', bad: 0 } },
    });
    const c = new TourController(deps);

    await c.start();

    const payload = JSON.parse(deps.fetchJson.mock.calls[0][1].body);
    expect(payload.stop_durations_s_override).toEqual({ A: 12, B: 34 });
  });

  test('start fails fast when tour plan cannot be loaded', async () => {
    const deps = makeBaseDeps({
      fetchJson: jest.fn().mockRejectedValue(new Error('HTTP 500 /api/tour/plan')),
    });
    const c = new TourController(deps);

    await expect(c.start()).rejects.toThrow(/tour_plan/i);

    expect(deps.beginDebugRun).not.toHaveBeenCalled();
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('start fails fast when playback recording has no stops', async () => {
    const deps = makeBaseDeps({
      playTourRecordingEnabledRef: { current: true },
      selectedTourRecordingIdRef: { current: 'rec-missing' },
      loadTourRecordingMeta: jest.fn().mockResolvedValue({ stops: [] }),
    });
    const c = new TourController(deps);

    await expect(c.start()).rejects.toThrow(/tour_recording/i);

    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(deps.setPlayTourRecordingEnabled).not.toHaveBeenCalled();
    expect(deps.setSelectedTourRecordingId).not.toHaveBeenCalled();
    expect(deps.playTourRecordingEnabledRef.current).toBe(true);
    expect(deps.selectedTourRecordingIdRef.current).toBe('rec-missing');
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('start fails fast when ragflow new_session bootstrap fails', async () => {
    const onRagflowUnavailable = jest.fn();
    const deps = makeBaseDeps({
      useAgentModeRef: { current: false },
      selectedChatRef: { current: 'Chat A' },
      onRagflowUnavailable,
      ragflowChatManager: {
        createNewSession: jest.fn().mockRejectedValue(new Error('HTTP 500 /api/ragflow/chats/new_session')),
      },
    });
    const c = new TourController(deps);

    await expect(c.start()).rejects.toThrow(/ragflow_unavailable/i);
    expect(onRagflowUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'tour_start_new_session',
      })
    );
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('start fails fast when recording archive startup fails', async () => {
    const deps = makeBaseDeps({
      tourRecordingEnabledRef: { current: true },
      startTourRecordingArchive: jest.fn().mockRejectedValue(new Error('disk full')),
    });
    const c = new TourController(deps);

    await expect(c.start()).rejects.toThrow(/tour_recording_archive_failed/i);

    expect(deps.startTourRecordingArchive).toHaveBeenCalledWith(['Stop A', 'Stop B']);
    expect(deps.beginDebugRun).not.toHaveBeenCalled();
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('start fails fast when continuous tour has no planned stops', async () => {
    const deps = makeBaseDeps({
      continuousTourRef: { current: true },
      fetchJson: jest.fn().mockResolvedValue({ stops: [] }),
      getTourStops: () => [],
    });
    const c = new TourController(deps);

    await expect(c.start()).rejects.toThrow(/tour_continuous_stops_missing/i);

    expect(deps.beginDebugRun).not.toHaveBeenCalled();
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('continue fails fast when question resume playback cannot enqueue audio', async () => {
    const deps = makeBaseDeps({
      tourResumeRef: {
        current: {
          _question: {
            stopIndex: 0,
            audioSegments: [{ audio_url: 'blob:1', text: 'hello' }],
          },
        },
      },
      tourStateRef: { current: { stopIndex: 0 } },
      getTtsManager: () => ({
        resetForRun: jest.fn(),
        enqueueAudioUrl: jest.fn(() => {
          throw new Error('queue offline');
        }),
      }),
    });
    const c = new TourController(deps);

    await expect(c.continue()).rejects.toThrow(/tour_question_resume_failed/i);

    expect(deps.beginDebugRun).not.toHaveBeenCalled();
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('continue fails fast when stop resume idle wait fails', async () => {
    const deps = makeBaseDeps({
      tourResumeRef: {
        current: {
          0: {
            kind: 'stop',
            segments: ['cached stop narration'],
          },
        },
      },
      tourStateRef: { current: { stopIndex: 0 } },
      setTourState: jest.fn(),
      getTtsManager: () => ({
        resetForRun: jest.fn(),
        enqueueText: jest.fn(),
        markRagDone: jest.fn(),
        ensureRunning: jest.fn(),
        waitForIdle: jest.fn().mockRejectedValue(new Error('speaker failed')),
      }),
    });
    const c = new TourController(deps);

    await expect(c.continue()).rejects.toThrow(/tour_resume_failed/i);

    expect(deps.beginDebugRun).not.toHaveBeenCalled();
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('continue fails fast when continuous resume does not advance tour state', async () => {
    const startContinuousTour = jest.fn().mockResolvedValue(undefined);
    const deps = makeBaseDeps({
      continuousTourRef: { current: true },
      tourResumeRef: {
        current: {
          0: {
            kind: 'stop',
            segments: ['cached stop narration'],
          },
        },
      },
      tourStateRef: { current: { stopIndex: 0 } },
      setTourState: jest.fn(),
      getTourPipeline: () => ({ startContinuousTour }),
      getTtsManager: () => ({
        resetForRun: jest.fn(),
        enqueueText: jest.fn(),
        markRagDone: jest.fn(),
        ensureRunning: jest.fn(),
        waitForIdle: jest.fn().mockResolvedValue(undefined),
      }),
    });
    const c = new TourController(deps);

    await expect(c.continue()).rejects.toThrow(/tour_continuous_resume_stalled/i);

    expect(startContinuousTour).not.toHaveBeenCalled();
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });

  test('nextStop fails fast when current run cannot be interrupted', async () => {
    const deps = makeBaseDeps({
      tourStateRef: { current: { stopIndex: 0 } },
      interruptCurrentRun: jest.fn(() => {
        throw new Error('interrupt offline');
      }),
    });
    const c = new TourController(deps);

    await expect(c.nextStop()).rejects.toThrow(/tour_interrupt_failed/i);

    expect(deps.beginDebugRun).not.toHaveBeenCalled();
    expect(deps.askQuestion).not.toHaveBeenCalled();
  });
});
