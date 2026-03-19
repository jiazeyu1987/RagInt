import { AskWorkflowManager } from './AskWorkflowManager';

describe('AskWorkflowManager', () => {
  test('flushes buffered ASR client events after request id is created', async () => {
    global.TextDecoder = class {
      decode() {
        return '';
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
          return {
            async read() {
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
});

