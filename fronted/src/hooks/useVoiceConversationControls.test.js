import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useVoiceConversationControls } from './useVoiceConversationControls';
import { useVoiceInputManager } from './useVoiceInputManager';

jest.mock('./useVoiceInputManager', () => ({
  useVoiceInputManager: jest.fn(),
}));

const mockState = {
  latestArgs: null,
  startRecording: null,
  stopRecording: null,
};

function buildHookProps(overrides = {}) {
  return {
    asrProviderType: 'voicekit_ws',
    baseUrl: 'http://unit.test',
    clientIdRef: { current: 'cid' },
    setInputText: jest.fn(),
    setIsLoading: jest.fn(),
    decodeAndConvertToWav16kMono: jest.fn(),
    unlockAudio: jest.fn(),
    ttsEnabledRef: { current: true },
    audioContextRef: { current: null },
    isLoading: false,
    wakeWordEnabled: true,
    wakeWord: 'hello assistant',
    wakeWordStrict: false,
    wakeWordCooldownMs: 3000,
    askQuestion: jest.fn(),
    submitUserText: jest.fn().mockResolvedValue({ ok: true, kind: 'asked' }),
    onAsrFinalText: jest.fn(),
    setQueueStatus: jest.fn(),
    inputText: '',
    groupMode: false,
    speakerName: 'speaker',
    questionPriority: 'normal',
    useAgentMode: false,
    selectedAgentId: '',
    continueTour: jest.fn().mockResolvedValue(undefined),
    autoSubmitSilenceMs: 1200,
    autoResumeAfterQaEnabled: true,
    shouldAutoResumeTour: () => true,
    canAutoResumeTour: () => true,
    isRunActive: () => false,
    isAsrBusyForResume: () => false,
    autoResumeTourAfterQaMs: 300,
    ...overrides,
  };
}

describe('useVoiceConversationControls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockState.latestArgs = null;
    mockState.startRecording = jest.fn().mockResolvedValue({ started: true });
    mockState.stopRecording = jest.fn();

    useVoiceInputManager.mockImplementation((args) => {
      mockState.latestArgs = args;
      return {
        isRecording: false,
        isRecognizing: false,
        recognitionStage: 'idle',
        startRecording: mockState.startRecording,
        stopRecording: mockState.stopRecording,
        onRecordPointerDown: jest.fn(),
        onRecordPointerUp: jest.fn(),
        onRecordPointerCancel: jest.fn(),
      };
    });
  });

  afterEach(() => {
    delete window.__RAGINT_E2E__;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('auto-submits ASR final text after silence and resumes tour after answer', async () => {
    const props = buildHookProps({ wakeWordEnabled: false });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await act(async () => {
      await hook.result().onToggleConversation();
    });
    expect(hook.result().conversationEnabled).toBe(true);

    await act(async () => {
      await mockState.latestArgs.onAsrFinalText('question one');
    });
    expect(props.submitUserText).toHaveBeenCalledTimes(0);

    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();

    expect(props.submitUserText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'question one',
        trigger: 'voice',
        skipTourCommand: true,
      })
    );

    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();

    expect(props.continueTour).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  test('dedupes rapid same-text auto submit', async () => {
    const props = buildHookProps();
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await act(async () => {
      await hook.result().onToggleConversation();
    });

    await act(async () => {
      await mockState.latestArgs.onAsrFinalText('same q');
      await mockState.latestArgs.onAsrFinalText('same q');
    });
    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();

    expect(props.submitUserText).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  test('still auto-resumes tour when resume eligibility remains but run is no longer active', async () => {
    const props = buildHookProps({
      shouldAutoResumeTour: () => false,
      canAutoResumeTour: () => true,
    });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await act(async () => {
      await hook.result().onToggleConversation();
    });

    await act(async () => {
      await mockState.latestArgs.onAsrFinalText('late barge-in question');
    });

    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();

    expect(props.submitUserText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'late barge-in question',
        trigger: 'voice',
      })
    );

    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();

    expect(props.continueTour).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  test('clears pending auto submit when conversation is ended', async () => {
    const props = buildHookProps();
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await act(async () => {
      await hook.result().onToggleConversation();
    });
    expect(hook.result().conversationEnabled).toBe(true);

    await act(async () => {
      await mockState.latestArgs.onAsrFinalText('will be cancelled');
    });

    await act(async () => {
      await hook.result().onToggleConversation();
    });
    expect(hook.result().conversationEnabled).toBe(false);
    expect(mockState.stopRecording).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();

    expect(props.submitUserText).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('does not auto-submit when agent mode is missing a selected agent', async () => {
    const props = buildHookProps({ useAgentMode: true, selectedAgentId: '' });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await act(async () => {
      await hook.result().onToggleConversation();
    });

    await act(async () => {
      await mockState.latestArgs.onAsrFinalText('agent question');
    });

    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();

    expect(props.submitUserText).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('surfaces missing submit dependency on manual text submit without leaking rejection', async () => {
    const props = buildHookProps({ inputText: 'manual question', submitUserText: undefined });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await expect(hook.result().handleTextSubmit({ preventDefault: jest.fn() })).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        kind: 'submit_failed',
        error: expect.objectContaining({ message: 'submitUserText dependency is required' }),
      })
    );

    expect(props.setQueueStatus).toHaveBeenCalledWith('submitUserText dependency is required');
    hook.unmount();
  });

  test('surfaces manual text submit failures without leaking rejection', async () => {
    const props = buildHookProps({
      inputText: 'manual question',
      submitUserText: jest.fn().mockRejectedValue(new Error('ask failed')),
    });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await expect(hook.result().handleTextSubmit({ preventDefault: jest.fn() })).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        kind: 'submit_failed',
        error: expect.objectContaining({ message: 'ask failed' }),
      })
    );

    expect(props.setQueueStatus).toHaveBeenCalledWith('text submit failed: ask failed');
    hook.unmount();
  });

  test('surfaces quick text submit failures without leaking rejection', async () => {
    const props = buildHookProps({
      submitUserText: jest.fn().mockRejectedValue(new Error('quick failed')),
    });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await expect(hook.result().submitTextAuto('quick question', 'quick')).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        kind: 'submit_failed',
        error: expect.objectContaining({ message: 'quick failed' }),
      })
    );

    expect(props.setQueueStatus).toHaveBeenCalledWith('text submit failed: quick failed');
    hook.unmount();
  });

  test('surfaces auto-submit failures instead of swallowing them', async () => {
    const props = buildHookProps({
      submitUserText: jest.fn().mockRejectedValue(new Error('submit failed')),
    });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await act(async () => {
      await hook.result().onToggleConversation();
    });

    await act(async () => {
      await mockState.latestArgs.onAsrFinalText('failing question');
    });

    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();

    expect(props.setQueueStatus).toHaveBeenCalledWith('voice conversation submit failed: submit failed');
    hook.unmount();
  });

  test('surfaces tour resume failures instead of swallowing them', async () => {
    const props = buildHookProps({
      continueTour: jest.fn().mockRejectedValue(new Error('resume failed')),
    });
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    await act(async () => {
      await hook.result().onToggleConversation();
    });

    await act(async () => {
      await mockState.latestArgs.onAsrFinalText('resume question');
    });
    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();

    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();

    expect(props.setQueueStatus).toHaveBeenCalledWith('voice conversation resume failed: resume failed');
    hook.unmount();
  });

  test('exposes e2e bridge methods when mock flag is enabled', async () => {
    window.__RAGINT_E2E__ = { enableAsrMock: true };
    const props = buildHookProps();
    const hook = renderHook((p) => useVoiceConversationControls(p), props);

    expect(typeof window.__RAGINT_E2E__.emitAsrFinal).toBe('function');
    expect(typeof window.__RAGINT_E2E__.setConversationEnabled).toBe('function');

    act(() => {
      window.__RAGINT_E2E__.setConversationEnabled(true);
    });
    await hook.flush();

    await act(async () => {
      await window.__RAGINT_E2E__.emitAsrFinal('bridge q');
    });
    act(() => {
      jest.advanceTimersByTime(1201);
    });
    await hook.flush();
    expect(props.submitUserText).toHaveBeenCalledWith(expect.objectContaining({ text: 'bridge q' }));

    hook.unmount();
    expect(window.__RAGINT_E2E__.emitAsrFinal).toBeUndefined();
    expect(window.__RAGINT_E2E__.setConversationEnabled).toBeUndefined();
  });
});
