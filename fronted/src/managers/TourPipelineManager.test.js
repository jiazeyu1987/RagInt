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

    expect(prompt).toContain('第2站「产品区」');
    expect(prompt).toContain('只输出一整段连续讲解正文');
    expect(prompt).toContain('不要分点');
  });

  test('buildTourPrompt in continuous mode keeps continuity requirement', () => {
    const mgr = createManager({
      getLastAnswerTail: () => '上一站刚结束，强调了核心价值。',
    });
    mgr._active = true;
    const prompt = mgr.buildTourPrompt('next', 1);

    expect(prompt).toContain('衔接要求');
    expect(prompt).toContain('上一段结束语（供承接）');
  });

  test('buildTourPrompt appends per-stop prompt when configured', () => {
    const mgr = createManager({
      getPerStopPrompts: () => ({
        产品区: '重点说明导丝与导管差异，避免混淆。',
      }),
    });

    const prompt = mgr.buildTourPrompt('next', 1);
    expect(prompt).toContain('本站附加提示词');
    expect(prompt).toContain('重点说明导丝与导管差异，避免混淆。');
  });

  test('buildTourPrompt rejects missing guide duration instead of using fallback duration', () => {
    const mgr = createManager({
      getGuideDuration: () => '',
      getPerStopDurations: () => [],
    });

    expect(() => mgr.buildTourPrompt('start', 1)).toThrow('guide_duration_required');
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

  test('replayPrefetchToQueue surfaces enqueue failures', () => {
    const mgr = createManager();
    const enqueueError = new Error('text queue unavailable');
    mgr._prefetchStore.set(1, {
      answerText: 'fallback',
      segments: ['第一句'],
      createdAt: Date.now(),
    });

    expect(() =>
      mgr.replayPrefetchToQueue({
        stopIndex: 1,
        enqueueSegment: () => {
          throw enqueueError;
        },
        ensureTtsRunning: jest.fn(),
      })
    ).toThrow(enqueueError);
  });

  test('replayPrefetchToQueue surfaces ensure failures', () => {
    const mgr = createManager();
    const ensureError = new Error('tts unavailable');
    mgr._prefetchStore.set(1, {
      answerText: 'fallback',
      segments: ['第一句'],
      createdAt: Date.now(),
    });

    expect(() =>
      mgr.replayPrefetchToQueue({
        stopIndex: 1,
        enqueueSegment: jest.fn(),
        ensureTtsRunning: () => {
          throw ensureError;
        },
      })
    ).toThrow(ensureError);
  });

  test('replayPrefetchAudioToQueue surfaces audio enqueue failures', () => {
    const mgr = createManager();
    const enqueueError = new Error('audio queue unavailable');
    mgr._prefetchStore.set(1, {
      answerText: '录音讲解',
      audioSegments: [{ audio_url: '/audio/1.wav', text: '第一句' }],
      createdAt: Date.now(),
    });

    expect(() =>
      mgr.replayPrefetchAudioToQueue({
        stopIndex: 1,
        enqueueAudioSegment: () => {
          throw enqueueError;
        },
        ensureTtsRunning: jest.fn(),
      })
    ).toThrow(enqueueError);
  });

  test('replayPrefetchToQueue returns false without cached replayable text', () => {
    const mgr = createManager();
    mgr._prefetchStore.set(1, {
      answerText: '   ',
      segments: [],
      createdAt: Date.now(),
    });

    expect(mgr.replayPrefetchToQueue({ stopIndex: 0 })).toBe(false);
    expect(mgr.replayPrefetchToQueue({ stopIndex: 1 })).toBe(false);
  });

  test('replayPrefetchToQueue does not replay answerText when segment stream was missing', () => {
    const mgr = createManager();
    const enqueueSegment = jest.fn();
    const ensureTtsRunning = jest.fn();
    mgr._prefetchStore.set(1, {
      answerText: '完整答案文本不能伪装成已分段讲解',
      segments: [],
      createdAt: Date.now(),
    });

    expect(
      mgr.replayPrefetchToQueue({
        stopIndex: 1,
        enqueueSegment,
        ensureTtsRunning,
      })
    ).toBe(false);
    expect(enqueueSegment).not.toHaveBeenCalled();
    expect(ensureTtsRunning).not.toHaveBeenCalled();
  });

  test('replayPrefetchAudioToQueue returns false without cached audio segments', () => {
    const mgr = createManager();
    mgr._prefetchStore.set(1, {
      answerText: '录音讲解',
      audioSegments: [],
      createdAt: Date.now(),
    });

    expect(mgr.replayPrefetchAudioToQueue({ stopIndex: 0 })).toBe(false);
    expect(mgr.replayPrefetchAudioToQueue({ stopIndex: 1 })).toBe(false);
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

  test('prefetchStopTextToQueue rejects and does not mark ready when enqueue callback fails', async () => {
    const enqueueError = new Error('enqueue unavailable');
    const warn = jest.fn();
    const ragflowChunkManager = {
      fetchAskStream: jest.fn().mockResolvedValue({ ok: true, body: {} }),
      readSseStream: jest.fn(async (_resp, handlers) => {
        await handlers.onEvent({ segment: '下一站讲解', done: false });
        await handlers.onEvent({ done: true });
      }),
    };
    const mgr = createManager({
      onWarn: warn,
      ragflowChunkManager,
      getInterruptEpoch: () => 3,
      isInterruptEpochCurrent: (epoch) => Number(epoch) === 3,
    });
    mgr._active = true;

    await expect(
      mgr.prefetchStopTextToQueue({
        stopIndex: 1,
        tail: '',
        epoch: 3,
        enqueueSegment: () => {
          throw enqueueError;
        },
        ensureTtsRunning: jest.fn(),
      })
    ).rejects.toThrow(enqueueError);

    expect(mgr.getPrefetch(1)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[PREFETCH] failed', expect.any(Error));
  });

  test('maybePrefetchNextStop observes fire-and-forget prefetch rejection', async () => {
    jest.useFakeTimers();
    const prefetchError = new Error('prefetch dependency unavailable');
    const warn = jest.fn();
    const mgr = createManager({
      onWarn: warn,
      getInterruptEpoch: () => 9,
      isInterruptEpochCurrent: (epoch) => Number(epoch) === 9,
    });
    mgr._active = true;
    mgr.prefetchStopTextToQueue = jest.fn().mockRejectedValue(prefetchError);

    mgr.maybePrefetchNextStop({
      currentStopIndex: 0,
      tail: '',
      enqueueSegment: jest.fn(),
      ensureTtsRunning: jest.fn(),
    });

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith('[PREFETCH] async failed', prefetchError);
    jest.useRealTimers();
  });

  test('prefetchStopFromRecordingToQueue rejects and does not mark ready when ensure callback fails', async () => {
    const ensureError = new Error('tts queue unavailable');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer_text: '录音讲解',
        tail: '录音讲解',
        segments: [{ audio_url: '/audio/1.wav', text: '录音讲解' }],
      }),
    });
    const warn = jest.fn();
    const mgr = createManager({
      onWarn: warn,
      getPlaybackRecordingId: () => 'rec-1',
      getInterruptEpoch: () => 4,
      isInterruptEpochCurrent: (epoch) => Number(epoch) === 4,
    });
    mgr._active = true;

    await expect(
      mgr.prefetchStopFromRecordingToQueue({
        recordingId: 'rec-1',
        stopIndex: 1,
        epoch: 4,
        enqueueAudioSegment: jest.fn(),
        ensureTtsRunning: () => {
          throw ensureError;
        },
      })
    ).rejects.toThrow(ensureError);

    expect(mgr.getPrefetch(1)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[PREFETCH_REC] failed', expect.any(Error));
  });

  test('prefetchStopFromRecordingToQueue builds recording URL without double slash fallback', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer_text: '录音讲解',
        tail: '录音讲解',
        segments: [],
      }),
    });
    const mgr = createManager({
      baseUrl: 'http://localhost:8101/',
      getPlaybackRecordingId: () => 'rec-1',
      getInterruptEpoch: () => 5,
      isInterruptEpochCurrent: (epoch) => Number(epoch) === 5,
    });
    mgr._active = true;

    await mgr.prefetchStopFromRecordingToQueue({
      recordingId: 'rec-1',
      stopIndex: 1,
      epoch: 5,
    });

    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:8101/api/recordings/rec-1/stop/1');
  });
});
