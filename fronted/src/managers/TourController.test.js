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
    tourRecordingEnabledRef: { current: false },
    activeTourRecordingIdRef: { current: 'rid_old' },
    startTourRecordingArchive: jest.fn().mockResolvedValue(''),
    loadTourRecordingMeta: jest.fn().mockResolvedValue(null),
    fetchJson: jest.fn().mockResolvedValue({
      stops: ['入口', '展区A'],
      stop_durations_s: [30, 60],
      stop_target_chars: [120, 240],
    }),
    tourZoneRef: { current: '默认路线' },
    audienceProfileRef: { current: '大众' },
    guideDurationRef: { current: '60' },
    tourMetaRef: { current: { default_zone: '默认路线', default_profile: '大众' } },
    tourStopsOverrideRef: { current: [] },
    setTourStops: jest.fn(),
    setTourStopDurations: jest.fn(),
    setTourStopTargetChars: jest.fn(),
    tourStopDurationsRef: { current: [] },
    tourStopTargetCharsRef: { current: [] },
    getTourStops: () => ['入口', '展区A'],
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
    expect(deps.setTourStops).toHaveBeenCalledWith(['入口', '展区A']);
    expect(deps.setTourStopDurations).toHaveBeenCalledWith([30, 60]);
    expect(deps.setTourStopTargetChars).toHaveBeenCalledWith([120, 240]);
    expect(deps.tourStopDurationsRef.current).toEqual([30, 60]);
    expect(deps.tourStopTargetCharsRef.current).toEqual([120, 240]);
  });
});
