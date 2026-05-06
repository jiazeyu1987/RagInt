import { AskWorkflowManager } from './AskWorkflowManager';

const createAskDeps = (overrides = {}) => ({
  getIsLoading: () => false,
  requestSeqRef: { current: 0 },
  interruptManagerRef: { current: { snapshot: () => 1, isCurrent: () => true } },
  askAbortRef: { current: null },
  currentAudioRef: { current: null },
  ttsManagerRef: { current: null },
  ttsEnabledRef: { current: false },
  debugRef: { current: null },
  beginDebugRun: jest.fn(),
  debugMark: jest.fn(),
  setLastQuestion: jest.fn(),
  setAnswer: jest.fn(),
  setAnswerCacheMeta: jest.fn(),
  setQaCacheDebug: jest.fn(),
  setIsLoading: jest.fn(),
  receivedSegmentsRef: { current: false },
  getTtsManager: () => null,
  abortPrefetch: jest.fn(),
  setTourState: jest.fn(),
  tourStateRef: { current: { stopIndex: 0, mode: 'idle' } },
  tourResumeRef: { current: {} },
  getTourStopName: () => '',
  startStatusMonitor: jest.fn(),
  setQueueStatus: jest.fn(),
  clientIdRef: { current: 'client-1' },
  activeAskRequestIdRef: { current: null },
  baseUrl: 'http://localhost',
  guideDurationRef: { current: '10' },
  guideStyleRef: { current: 'friendly' },
  guideEnabledRef: { current: false },
  audienceProfileRef: { current: 'general' },
  qaAnswerTargetCharsRef: { current: '10' },
  qaAudioCacheConfidenceThresholdRef: { current: '0.85' },
  qaAudioCacheLookupEnabledRef: { current: true },
  tourStopDurationsRef: { current: [] },
  tourStopTargetCharsRef: { current: [] },
  useAgentModeRef: { current: false },
  selectedChatRef: { current: 'chat' },
  selectedAgentIdRef: { current: '' },
  setCurrentIntent: jest.fn(),
  setActiveRagflowConversationName: jest.fn(),
  getTourPipeline: () => null,
  getHistorySort: () => 'latest',
  fetchHistory: jest.fn(),
  maybeStartNextQueuedQuestion: jest.fn(),
  runCoordinatorRef: { current: null },
  getTourStops: () => [],
  tourRecordingEnabledRef: { current: false },
  playTourRecordingEnabledRef: { current: false },
  selectedTourRecordingIdRef: { current: '' },
  activeTourRecordingIdRef: { current: '' },
  finishTourRecordingArchive: jest.fn(),
  globalPromptPrefixRef: { current: '' },
  emitClientEvent: jest.fn(),
  consumePendingAsrClientEvents: () => [],
  ...overrides,
});

  test('surfaces invalid recording playback schema instead of treating it as empty success', async () => {
    const setQueueStatus = jest.fn();
    const setAnswer = jest.fn();
    const setIsLoading = jest.fn();
    const manager = new AskWorkflowManager(
      createAskDeps({
        setAnswer,
        setIsLoading,
        setQueueStatus,
        ttsEnabledRef: { current: false },
        playTourRecordingEnabledRef: { current: true },
        selectedTourRecordingIdRef: { current: 'rec-1' },
        tourStateRef: { current: { stopIndex: 2, mode: 'idle' } },
      })
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ chunks: null, segments: [] }),
    });

    const result = await manager.ask('play stop', { tourAction: 'jump', tourStopIndex: 2 });

    expect(result).toBe('');
    expect(setAnswer).toHaveBeenCalledWith('');
    expect(setQueueStatus).toHaveBeenCalledWith('\u95ee\u7b54\u5931\u8d25: recording_stop_invalid_chunks');
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
  });

  test('surfaces recording playback TTS dependency failures instead of skipping audio segments', async () => {
    const setQueueStatus = jest.fn();
    const ttsMgr = {
      resetForRun: jest.fn(),
      getTtsProfile: jest.fn(() => ({ provider: '', voice: '', speed: 1.0 })),
      setRecordingId: jest.fn(),
      markRagDone: jest.fn(),
      ensureRunning: jest.fn(),
      waitForIdle: jest.fn().mockResolvedValue(undefined),
    };
    const manager = new AskWorkflowManager(
      createAskDeps({
        setQueueStatus,
        ttsEnabledRef: { current: true },
        getTtsManager: () => ttsMgr,
        playTourRecordingEnabledRef: { current: true },
        selectedTourRecordingIdRef: { current: 'rec-1' },
        tourStateRef: { current: { stopIndex: 0, mode: 'idle' } },
      })
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        chunks: ['recorded text'],
        segments: [{ audio_url: '/audio.wav', text: 'recorded text' }],
      }),
    });

    const result = await manager.ask('play stop', { tourAction: 'jump', tourStopIndex: 0 });

    expect(result).toBe('');
    expect(setQueueStatus).toHaveBeenCalledWith('\u95ee\u7b54\u5931\u8d25: recording_playback_tts_enqueue_missing');
    expect(ttsMgr.markRagDone).not.toHaveBeenCalled();
  });

describe('AskWorkflowManager', () => {
  test('flushes buffered ASR client events after request id is created', async () => {
    global.TextDecoder = class {
      decode(value) {
        return value ? 'data: {"done":true}\n\n' : '';
      }
    };
    const emitClientEvent = jest.fn();
    const manager = new AskWorkflowManager({
      getIsLoading: () => false,
      requestSeqRef: { current: 0 },
      interruptManagerRef: { current: { snapshot: () => 1, isCurrent: () => true } },
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      ttsEnabledRef: { current: false },
      debugRef: { current: null },
      beginDebugRun: jest.fn(),
      debugMark: jest.fn(),
      setLastQuestion: jest.fn(),
      setAnswer: jest.fn(),
      setAnswerCacheMeta: jest.fn(),
      setQaCacheDebug: jest.fn(),
      setIsLoading: jest.fn(),
      receivedSegmentsRef: { current: false },
      getTtsManager: () => null,
      abortPrefetch: jest.fn(),
      setTourState: jest.fn(),
      tourStateRef: { current: { stopIndex: 0, mode: 'idle' } },
      tourResumeRef: { current: {} },
      getTourStopName: () => '',
      startStatusMonitor: jest.fn(),
      setQueueStatus: jest.fn(),
      clientIdRef: { current: 'client-1' },
      activeAskRequestIdRef: { current: null },
      baseUrl: 'http://localhost',
      guideDurationRef: { current: '10' },
      guideStyleRef: { current: 'friendly' },
      guideEnabledRef: { current: false },
      audienceProfileRef: { current: 'general' },
      qaAnswerTargetCharsRef: { current: '10' },
      qaAudioCacheConfidenceThresholdRef: { current: '0.85' },
      qaAudioCacheLookupEnabledRef: { current: true },
      tourStopDurationsRef: { current: [] },
      tourStopTargetCharsRef: { current: [] },
      useAgentModeRef: { current: false },
      selectedChatRef: { current: 'chat' },
      selectedAgentIdRef: { current: '' },
      setCurrentIntent: jest.fn(),
      getTourPipeline: () => null,
      getHistorySort: () => 'latest',
      fetchHistory: jest.fn(),
      maybeStartNextQueuedQuestion: jest.fn(),
      runCoordinatorRef: { current: null },
      getTourStops: () => [],
      tourRecordingEnabledRef: { current: false },
      playTourRecordingEnabledRef: { current: false },
      selectedTourRecordingIdRef: { current: '' },
      activeTourRecordingIdRef: { current: '' },
      finishTourRecordingArchive: jest.fn(),
      globalPromptPrefixRef: { current: '' },
      emitClientEvent,
      consumePendingAsrClientEvents: () => [
        { name: 'accepted', fields: { rawText: 'raw text', correctedText: 'fixed text', finalText: 'final text' } },
        { name: 'filtering_finished', fields: { rawText: 'raw text', correctedText: 'fixed text' } },
      ],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          let readCount = 0;
          return {
            async read() {
              readCount += 1;
              if (readCount === 1) return { done: false, value: 'done-frame' };
              return { done: true, value: undefined };
            },
          };
        },
      },
      headers: {
        get() {
          return 'text/event-stream';
        },
      },
    });

    await manager.ask('test question');

    expect(emitClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'voice',
        name: 'asr_accepted',
      })
    );
    expect(emitClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'voice',
        name: 'asr_filtering_finished',
      })
    );
  });

  test('updates active ragflow conversation from stream meta events', async () => {
    global.TextDecoder = class {
      decode(value) {
        return typeof value === 'string' ? value : '';
      }
    };
    const setActiveRagflowConversationName = jest.fn();
    const manager = new AskWorkflowManager({
      getIsLoading: () => false,
      requestSeqRef: { current: 0 },
      interruptManagerRef: { current: { snapshot: () => 1, isCurrent: () => true } },
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      ttsEnabledRef: { current: false },
      debugRef: { current: null },
      beginDebugRun: jest.fn(),
      debugMark: jest.fn(),
      setLastQuestion: jest.fn(),
      setAnswer: jest.fn(),
      setAnswerCacheMeta: jest.fn(),
      setQaCacheDebug: jest.fn(),
      setIsLoading: jest.fn(),
      receivedSegmentsRef: { current: false },
      getTtsManager: () => null,
      abortPrefetch: jest.fn(),
      setTourState: jest.fn(),
      tourStateRef: { current: { stopIndex: 0, mode: 'idle' } },
      tourResumeRef: { current: {} },
      getTourStopName: () => '',
      startStatusMonitor: jest.fn(),
      setQueueStatus: jest.fn(),
      clientIdRef: { current: 'client-1' },
      activeAskRequestIdRef: { current: null },
      baseUrl: 'http://localhost',
      guideDurationRef: { current: '10' },
      guideStyleRef: { current: 'friendly' },
      guideEnabledRef: { current: false },
      audienceProfileRef: { current: 'general' },
      qaAnswerTargetCharsRef: { current: '10' },
      qaAudioCacheConfidenceThresholdRef: { current: '0.85' },
      qaAudioCacheLookupEnabledRef: { current: true },
      tourStopDurationsRef: { current: [] },
      tourStopTargetCharsRef: { current: [] },
      useAgentModeRef: { current: false },
      selectedChatRef: { current: 'chat' },
      selectedAgentIdRef: { current: '' },
      setCurrentIntent: jest.fn(),
      setActiveRagflowConversationName,
      getTourPipeline: () => null,
      getHistorySort: () => 'latest',
      fetchHistory: jest.fn(),
      maybeStartNextQueuedQuestion: jest.fn(),
      runCoordinatorRef: { current: null },
      getTourStops: () => [],
      tourRecordingEnabledRef: { current: false },
      playTourRecordingEnabledRef: { current: false },
      selectedTourRecordingIdRef: { current: '' },
      activeTourRecordingIdRef: { current: '' },
      finishTourRecordingArchive: jest.fn(),
      globalPromptPrefixRef: { current: '' },
      emitClientEvent: jest.fn(),
      consumePendingAsrClientEvents: () => [],
    });

    const sseFrames = [
      'data: {"meta":{"ragflow_chat_active":"\\u95ee\\u9898\\u6bd4\\u5bf9","ragflow_chat_stage":"qa_match"}}\n',
      'data: {"meta":{"ragflow_chat_active":"\\u5c55\\u5385\\u804a\\u5929","ragflow_chat_stage":"main_ask"}}\n',
      'data: {"done":true}\n',
      '\n',
    ];
    let idx = 0;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          return {
            async read() {
              if (idx >= sseFrames.length) return { done: true, value: undefined };
              const frame = sseFrames[idx++];
              return { done: false, value: frame };
            },
          };
        },
      },
      headers: {
        get() {
          return 'text/event-stream';
        },
      },
    });

    await manager.ask('test question');

    expect(setActiveRagflowConversationName).toHaveBeenNthCalledWith(1, '');
    expect(setActiveRagflowConversationName).toHaveBeenNthCalledWith(2, '\u95ee\u9898\u6bd4\u5bf9');
    expect(setActiveRagflowConversationName).toHaveBeenNthCalledWith(3, '\u5c55\u5385\u804a\u5929');
  });

  test('keeps global ragflow availability unchanged after ask transport failure', async () => {
    global.TextDecoder = class {
      decode() {
        return '';
      }
    };
    const setQueueStatus = jest.fn();
    const onRagflowUnavailable = jest.fn();
    const manager = new AskWorkflowManager({
      getIsLoading: () => false,
      requestSeqRef: { current: 0 },
      interruptManagerRef: { current: { snapshot: () => 1, isCurrent: () => true } },
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      ttsEnabledRef: { current: false },
      debugRef: { current: null },
      beginDebugRun: jest.fn(),
      debugMark: jest.fn(),
      setLastQuestion: jest.fn(),
      setAnswer: jest.fn(),
      setAnswerCacheMeta: jest.fn(),
      setQaCacheDebug: jest.fn(),
      setIsLoading: jest.fn(),
      receivedSegmentsRef: { current: false },
      getTtsManager: () => null,
      abortPrefetch: jest.fn(),
      setTourState: jest.fn(),
      tourStateRef: { current: { stopIndex: 0, mode: 'idle' } },
      tourResumeRef: { current: {} },
      getTourStopName: () => '',
      startStatusMonitor: jest.fn(),
      setQueueStatus,
      onRagflowUnavailable,
      clientIdRef: { current: 'client-1' },
      activeAskRequestIdRef: { current: null },
      baseUrl: 'http://localhost',
      guideDurationRef: { current: '10' },
      guideStyleRef: { current: 'friendly' },
      guideEnabledRef: { current: false },
      audienceProfileRef: { current: 'general' },
      qaAnswerTargetCharsRef: { current: '10' },
      qaAudioCacheConfidenceThresholdRef: { current: '0.85' },
      qaAudioCacheLookupEnabledRef: { current: true },
      tourStopDurationsRef: { current: [] },
      tourStopTargetCharsRef: { current: [] },
      useAgentModeRef: { current: false },
      selectedChatRef: { current: 'chat' },
      selectedAgentIdRef: { current: '' },
      setCurrentIntent: jest.fn(),
      getTourPipeline: () => null,
      getHistorySort: () => 'latest',
      fetchHistory: jest.fn(),
      maybeStartNextQueuedQuestion: jest.fn(),
      runCoordinatorRef: { current: null },
      getTourStops: () => [],
      tourRecordingEnabledRef: { current: false },
      playTourRecordingEnabledRef: { current: false },
      selectedTourRecordingIdRef: { current: '' },
      activeTourRecordingIdRef: { current: '' },
      finishTourRecordingArchive: jest.fn(),
      globalPromptPrefixRef: { current: '' },
      emitClientEvent: jest.fn(),
      consumePendingAsrClientEvents: () => [],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
      headers: {
        get() {
          return 'application/json';
        },
      },
    });

    await manager.ask('will fail');

    expect(setQueueStatus).toHaveBeenCalledWith(
      'RAGFlow \u95ee\u7b54\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5f53\u524d\u8fde\u63a5\u6216\u7a0d\u540e\u91cd\u8bd5\u3002'
    );
    expect(onRagflowUnavailable).not.toHaveBeenCalled();
  });

  test('surfaces stream event state write failures instead of continuing successfully', async () => {
    const setQueueStatus = jest.fn();
    const setAnswer = jest.fn((value) => {
      if (value === 'partial answer') throw new Error('state_write_failed');
    });
    const setIsLoading = jest.fn();
    const chunkManager = {
      fetchAskStream: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: jest.fn() },
      }),
      readSseStream: jest.fn(async (_response, handlers) => {
        await handlers.onEvent({ chunk: 'partial answer' });
      }),
    };
    const manager = new AskWorkflowManager(
      createAskDeps({
        setAnswer,
        setIsLoading,
        setQueueStatus,
        ragflowChunkManager: chunkManager,
      })
    );

    const result = await manager.ask('test question');

    expect(result).toBe('');
    expect(setQueueStatus).toHaveBeenCalledWith('问答失败: ask_stream_event_failed: state_write_failed');
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
  });

  test('surfaces stream completion without done instead of returning a partial answer as success', async () => {
    const setQueueStatus = jest.fn();
    const setAnswer = jest.fn();
    const chunkManager = {
      fetchAskStream: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: jest.fn() },
      }),
      readSseStream: jest.fn(async (_response, handlers) => {
        await handlers.onEvent({ chunk: 'partial answer' });
      }),
    };
    const manager = new AskWorkflowManager(
      createAskDeps({
        setAnswer,
        setQueueStatus,
        ragflowChunkManager: chunkManager,
      })
    );

    const result = await manager.ask('test question');

    expect(setAnswer).toHaveBeenCalledWith('partial answer');
    expect(result).toBe('');
    expect(setQueueStatus).toHaveBeenCalledWith('问答失败: ragflow_stream_done_missing');
  });
});
