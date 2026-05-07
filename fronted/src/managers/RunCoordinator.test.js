import { RunCoordinator } from './RunCoordinator';

describe('RunCoordinator', () => {
  test('submitUserText returns missing_agent when agent mode is enabled but no agent selected', async () => {
    const askQuestion = jest.fn().mockResolvedValue('');
    const c = new RunCoordinator({
      askQuestion,
      setInputText: jest.fn(),
      beginDebugRun: jest.fn(),
    });

    const res = await c.submitUserText({
      text: '你好',
      trigger: 'text',
      useAgentMode: true,
      selectedAgentId: '',
      groupMode: false,
    });

    expect(res).toEqual({ ok: false, kind: 'missing_agent' });
    expect(askQuestion).not.toHaveBeenCalled();
  });

  test('submitUserText preprocesses text before asking', async () => {
    const askQuestion = jest.fn().mockResolvedValue('');
    const beginDebugRun = jest.fn();
    const setInputText = jest.fn();
    const preprocessVoiceText = jest.fn().mockResolvedValue('介绍一下指引导丝');
    const c = new RunCoordinator({
      askQuestion,
      beginDebugRun,
      preprocessVoiceText,
      setInputText,
      ttsEnabledRef: { current: false },
      audioContextRef: { current: null },
      unlockAudio: jest.fn(),
      getIsLoading: () => false,
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
    });

    const res = await c.submitUserText({
      text: '介绍一下指引导致',
      trigger: 'text',
      useAgentMode: false,
      selectedAgentId: '',
      groupMode: false,
    });

    expect(res).toEqual({ ok: true, kind: 'asked' });
    expect(preprocessVoiceText).toHaveBeenCalledWith({ text: '介绍一下指引导致', trigger: 'text' });
    expect(beginDebugRun).toHaveBeenCalledWith('text');
    expect(setInputText).toHaveBeenCalledWith('');
    expect(askQuestion).toHaveBeenCalledWith('介绍一下指引导丝', undefined);
  });

  test('submitUserText in group mode enqueues then asks when idle', async () => {
    const askQuestion = jest.fn().mockResolvedValue('');
    const setQuestionQueue = jest.fn();
    const queueRef = { current: [] };
    const c = new RunCoordinator({
      askQuestion,
      beginDebugRun: jest.fn(),
      setInputText: jest.fn(),
      ttsEnabledRef: { current: false },
      audioContextRef: { current: null },
      unlockAudio: jest.fn(),
      getIsLoading: () => false,
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      queueRef,
      setQuestionQueue,
      lastSpeakerRef: { current: '' },
      groupModeRef: { current: true },
      guideEnabledRef: { current: false },
      tourPipelineRef: { current: null },
    });

    const res = await c.submitUserText({
      text: '这个产品适合谁',
      trigger: 'text',
      groupMode: true,
      speakerName: '观众A',
      priority: 'normal',
      useAgentMode: false,
      selectedAgentId: '',
    });

    expect(res).toEqual({ ok: true, kind: 'group_enqueued' });
    expect(askQuestion).toHaveBeenCalledTimes(1);
    expect(askQuestion.mock.calls[0][0]).toContain('【提问人：观众A】这个产品适合谁');
    expect(queueRef.current).toEqual([]);
    expect(setQuestionQueue).toHaveBeenCalled();
  });

  test('submitUserText skips tour command parsing when skipTourCommand is true', async () => {
    const askQuestion = jest.fn().mockResolvedValue('');
    const parseTourCommand = jest.fn().mockResolvedValue({
      intent: 'tour_command',
      action: 'next',
      confidence: 0.99,
    });
    const c = new RunCoordinator({
      askQuestion,
      parseTourCommand,
      beginDebugRun: jest.fn(),
      setInputText: jest.fn(),
      setQueueStatus: jest.fn(),
      ttsEnabledRef: { current: false },
      audioContextRef: { current: null },
      unlockAudio: jest.fn(),
      getIsLoading: () => false,
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      guideEnabledRef: { current: true },
      clientIdRef: { current: 'client-1' },
      getTourStops: () => ['A'],
    });

    const res = await c.submitUserText({
      text: 'next stop please',
      trigger: 'wake_word',
      groupMode: false,
      useAgentMode: false,
      selectedAgentId: '',
      skipTourCommand: true,
    });

    expect(res).toEqual({ ok: true, kind: 'asked' });
    expect(parseTourCommand).not.toHaveBeenCalled();
    expect(askQuestion).toHaveBeenCalledWith('next stop please', undefined);
  });

  test('submitUserText fails fast when preprocessing fails', async () => {
    const cause = new Error('preprocess unavailable');
    const askQuestion = jest.fn().mockResolvedValue('');
    const c = new RunCoordinator({
      askQuestion,
      preprocessVoiceText: jest.fn().mockRejectedValue(cause),
    });

    await expect(
      c.submitUserText({
        text: 'hello',
        trigger: 'text',
        groupMode: false,
        useAgentMode: false,
        selectedAgentId: '',
      })
    ).rejects.toMatchObject({
      message: '[RUN] preprocess text failed',
      cause,
    });
    expect(askQuestion).not.toHaveBeenCalled();
  });

  test('ask fails fast when askQuestion dependency is missing', async () => {
    const c = new RunCoordinator({});

    await expect(c.ask('hello')).rejects.toThrow('[RUN] askQuestion dependency missing');
  });

  test('prepareAsk propagates state preparation failures', () => {
    const failure = new Error('input state failed');
    const c = new RunCoordinator({
      ttsEnabledRef: { current: false },
      beginDebugRun: jest.fn(),
      setInputText: jest.fn(() => {
        throw failure;
      }),
    });

    expect(() => c.prepareAsk('text')).toThrow(failure);
  });

  test('submitUserText fails tour commands when tour controller action is missing', async () => {
    const askQuestion = jest.fn().mockResolvedValue('');
    const c = new RunCoordinator({
      askQuestion,
      parseTourCommand: jest.fn().mockResolvedValue({
        intent: 'tour_command',
        action: 'next',
        confidence: 0.99,
      }),
      guideEnabledRef: { current: true },
      clientIdRef: { current: 'client-1' },
      getTourStops: () => ['A'],
      getTourController: () => ({}),
    });

    const res = await c.submitUserText({
      text: 'next stop please',
      trigger: 'wake_word',
      groupMode: false,
      useAgentMode: false,
      selectedAgentId: '',
    });

    expect(res).toEqual({
      ok: false,
      kind: 'tour_command_failed',
      error: expect.objectContaining({ message: '[RUN] tour action missing: next' }),
    });
    expect(askQuestion).not.toHaveBeenCalled();
  });

  test('maybeStartNextQueuedQuestion propagates auto ask failures', async () => {
    const failure = new Error('ask failed');
    const queueRef = {
      current: [{ id: 'q1', speaker: 'Alice', text: 'question', priority: 'normal' }],
    };
    const c = new RunCoordinator({
      askQuestion: jest.fn().mockRejectedValue(failure),
      beginDebugRun: jest.fn(),
      getIsLoading: () => false,
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      queueRef,
      setQuestionQueue: jest.fn(),
      lastSpeakerRef: { current: '' },
      groupModeRef: { current: true },
      tourPipelineRef: { current: null },
    });

    await expect(c.maybeStartNextQueuedQuestion()).rejects.toBe(failure);
  });

  test('answerQueuedNow propagates takeover ask failures', async () => {
    const failure = new Error('takeover failed');
    const queueRef = {
      current: [{ id: 'q1', speaker: 'Alice', text: 'question', priority: 'high' }],
    };
    const c = new RunCoordinator({
      askQuestion: jest.fn().mockRejectedValue(failure),
      beginDebugRun: jest.fn(),
      getIsLoading: () => false,
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      queueRef,
      setQuestionQueue: jest.fn(),
      lastSpeakerRef: { current: '' },
    });

    await expect(c.answerQueuedNow(queueRef.current[0])).rejects.toBe(failure);
  });

  test('submitUserText returns tour_command_failed without falling back to ask', async () => {
    const failure = new Error('tour command parse failed');
    const askQuestion = jest.fn().mockResolvedValue('');
    const c = new RunCoordinator({
      askQuestion,
      parseTourCommand: jest.fn().mockRejectedValue(failure),
      guideEnabledRef: { current: true },
      clientIdRef: { current: 'client-1' },
      getTourStops: () => ['A'],
    });

    const res = await c.submitUserText({
      text: 'next stop please',
      trigger: 'wake_word',
      groupMode: false,
      useAgentMode: false,
      selectedAgentId: '',
    });

    expect(res).toEqual({ ok: false, kind: 'tour_command_failed', error: failure });
    expect(askQuestion).not.toHaveBeenCalled();
  });
});
