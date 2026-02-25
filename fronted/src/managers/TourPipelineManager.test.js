import { TourPipelineManager } from './TourPipelineManager';

describe('TourPipelineManager', () => {
  function createManager(overrides = {}) {
    return new TourPipelineManager({
      baseUrl: '',
      getStops: () => ['入口', '产品区', '体验区'],
      getLastAnswerTail: () => '下面我们继续参观下一站',
      getAudienceProfile: () => '大众',
      getGuideDuration: () => 60,
      getGuideStyle: () => 'friendly',
      getGuideEnabled: () => true,
      getPerStopDurations: () => [],
      getPerStopTargetChars: () => [],
      isContinuousTourEnabled: () => true,
      ...overrides,
    });
  }

  test('buildTourPrompt asks for single-paragraph narration', () => {
    const mgr = createManager();
    const prompt = mgr.buildTourPrompt('start', 1);

    expect(prompt).toContain('第2站“产品区”');
    expect(prompt).toContain('只输出一段连续讲解正文');
    expect(prompt).toContain('不要分点');
  });

  test('buildTourPrompt in continuous mode keeps continuity requirement', () => {
    const mgr = createManager({
      getLastAnswerTail: () => '上一站刚结束，强调了核心价值。',
    });
    mgr._active = true;
    const prompt = mgr.buildTourPrompt('next', 1);

    expect(prompt).toContain('连续讲解要求');
    expect(prompt).toContain('上一段结尾（用于承接）');
  });

  test('replayPrefetchToQueue replays cached segments in order', () => {
    const mgr = createManager();
    const queued = [];
    mgr._prefetchStore.set(1, {
      answerText: 'fallback',
      segments: ['第一句', '第二句'],
      createdAt: Date.now(),
    });

    const ok = mgr.replayPrefetchToQueue({
      stopIndex: 1,
      enqueueSegment: (seg, meta) => queued.push({ seg, meta }),
      ensureTtsRunning: jest.fn(),
    });

    expect(ok).toBe(true);
    expect(queued.map((x) => x.seg)).toEqual(['第一句', '第二句']);
    expect(queued.every((x) => x.meta.stopIndex === 1)).toBe(true);
  });

  test('startContinuousTour keeps active after root ask returns', async () => {
    const mgr = createManager({
      getInterruptEpoch: () => 7,
      isInterruptEpochCurrent: (e) => Number(e) === 7,
    });
    const askQuestion = jest.fn(async () => {});

    await mgr.startContinuousTour({
      startIndex: 0,
      firstAction: 'start',
      askQuestion,
      stopsOverride: ['A', 'B'],
    });

    expect(askQuestion).toHaveBeenCalled();
    expect(mgr.isActive()).toBe(true);
  });
});
