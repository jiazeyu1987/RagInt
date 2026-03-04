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
        { name: 'accepted', fields: { rawText: '原始文本', correctedText: '纠错文本', finalText: '最终文本' } },
        { name: 'filtering_finished', fields: { rawText: '原始文本', correctedText: '纠错文本' } },
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

    await manager.ask('测试问题');

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
});
