import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { TOUR_BTN_MODE } from './appShellState';
import { useAppShellReset } from './useAppShellReset';

describe('useAppShellReset', () => {
  function createResetProps(overrides = {}) {
    const ttsManager = { stop: jest.fn() };
    const props = {
      onInterruptManual: jest.fn(),
      resetTour: jest.fn().mockResolvedValue(undefined),
      queueRef: { current: ['queued'] },
      voiceConversationTurnsRef: { current: ['turn'] },
      activeAskRequestIdRef: { current: 'request-1' },
      askAbortRef: { current: { abort: jest.fn() } },
      ttsManagerRef: { current: ttsManager },
      currentAudioRef: { current: { id: 'audio' } },
      setActiveRagflowConversationName: jest.fn(),
      setTourButtonState: jest.fn((updater) =>
        typeof updater === 'function' ? updater({ started: true, mode: TOUR_BTN_MODE.INTERRUPT }) : updater
      ),
      resetTourButtonPlaybackActivity: jest.fn(),
      setInputText: jest.fn(),
      setLastQuestion: jest.fn(),
      setAnswer: jest.fn(),
      setAnswerCacheMeta: jest.fn(),
      setQaCacheDebug: jest.fn(),
      setQueueStatus: jest.fn(),
      setQuestionQueue: jest.fn(),
      setCurrentIntent: jest.fn(),
      setIsLoading: jest.fn(),
      setTourSelectedStopIndex: jest.fn(),
      ...overrides,
    };
    return { props, ttsManager };
  }

  test('interrupts, resets tour, clears refs, stops audio, and clears UI state', async () => {
    const { props, ttsManager } = createResetProps();
    const hook = renderHook((nextProps) => useAppShellReset(nextProps), props);

    await act(async () => {
      await hook.result().onResetAll();
    });

    expect(props.onInterruptManual).toHaveBeenCalledTimes(1);
    expect(props.resetTour).toHaveBeenCalledTimes(1);
    expect(props.queueRef.current).toEqual([]);
    expect(props.voiceConversationTurnsRef.current).toEqual([]);
    expect(props.activeAskRequestIdRef.current).toBe(null);
    expect(props.askAbortRef.current).toBe(null);
    expect(ttsManager.stop).toHaveBeenCalledWith('reset_all');
    expect(props.currentAudioRef.current).toBe(null);
    expect(props.setTourButtonState.mock.results[0].value).toEqual({ started: false, mode: TOUR_BTN_MODE.START });
    expect(props.resetTourButtonPlaybackActivity).toHaveBeenCalledTimes(1);
    expect(props.setInputText).toHaveBeenCalledWith('');
    expect(props.setLastQuestion).toHaveBeenCalledWith('');
    expect(props.setAnswer).toHaveBeenCalledWith('');
    expect(props.setAnswerCacheMeta).toHaveBeenCalledWith({ hit: false, type: '' });
    expect(props.setQaCacheDebug).toHaveBeenCalledWith(null);
    expect(props.setQueueStatus).toHaveBeenCalledWith('');
    expect(props.setQuestionQueue).toHaveBeenCalledWith([]);
    expect(props.setCurrentIntent).toHaveBeenCalledWith(null);
    expect(props.setIsLoading).toHaveBeenCalledWith(false);
    expect(props.setTourSelectedStopIndex).toHaveBeenCalledWith(0);
  });

  test('throws when interrupt handler fails', async () => {
    const { props } = createResetProps({
      onInterruptManual: jest.fn(() => {
        throw new Error('interrupt failed');
      }),
    });
    const hook = renderHook((nextProps) => useAppShellReset(nextProps), props);

    await expect(async () => {
      await act(async () => {
        await hook.result().onResetAll();
      });
    }).rejects.toThrow('interrupt failed');

    expect(props.resetTour).not.toHaveBeenCalled();
  });

  test('rejects when tour reset fails', async () => {
    const { props } = createResetProps({
      resetTour: jest.fn().mockRejectedValue(new Error('reset failed')),
    });
    const hook = renderHook((nextProps) => useAppShellReset(nextProps), props);

    await expect(async () => {
      await act(async () => {
        await hook.result().onResetAll();
      });
    }).rejects.toThrow('reset failed');

    expect(props.setInputText).not.toHaveBeenCalled();
  });

  test('throws when TTS stop fails during reset', async () => {
    const { props } = createResetProps({
      ttsManagerRef: {
        current: {
          stop: jest.fn(() => {
            throw new Error('stop failed');
          }),
        },
      },
    });
    const hook = renderHook((nextProps) => useAppShellReset(nextProps), props);

    await expect(async () => {
      await act(async () => {
        await hook.result().onResetAll();
      });
    }).rejects.toThrow('stop failed');

    expect(props.setInputText).not.toHaveBeenCalled();
  });
});
