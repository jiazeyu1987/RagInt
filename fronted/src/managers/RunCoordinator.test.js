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
});
