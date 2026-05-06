import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useAppShellAsrInput } from './useAppShellAsrInput';

describe('useAppShellAsrInput', () => {
  function renderAsrInput({ processResult, processImpl } = {}) {
    const setQueueStatus = jest.fn();
    const pipeline = {
      clearPendingAsrText: jest.fn(),
      setPendingAsrText: jest.fn(),
      getWakeHoldUntilMs: jest.fn(() => 12345),
      process:
        processImpl ||
        jest.fn().mockResolvedValue(
          processResult || {
            accepted: true,
            text: '纠错后的文本',
            correctedText: '纠错后的文本',
            reason: '',
            feedback: '',
            stage: 'accepted',
          }
        ),
    };
    const hook = renderHook((props) => useAppShellAsrInput(props), {
      createPipeline: () => pipeline,
      setQueueStatus,
      showTransientQueueStatus: jest.fn(),
      wakeWordEnabled: true,
      wakeWord: '小导游',
      wakeWordStrict: false,
      asrTextFilterEnabled: true,
      asrTextFilterPrompt: '纠错',
      asrTextFilterChatName: '展厅聊天',
      asrTextFilterTerms: '展品',
    });
    return { hook, pipeline, setQueueStatus };
  }

  test('updates manual input and clears pending ASR processing state', () => {
    const { hook, pipeline } = renderAsrInput();

    act(() => {
      hook.result().setInputText(' 手动问题 ');
    });

    expect(hook.result().inputText).toBe(' 手动问题 ');
    expect(hook.result().pendingAsrFinalTextRef.current).toBe('');
    expect(pipeline.clearPendingAsrText).toHaveBeenCalledTimes(1);
    expect(hook.result().asrPostProcessStage).toBe('idle');
    expect(hook.result().asrPostProcessEvents).toEqual([]);
    expect(hook.result().asrE2eProbeRef.current.inputText).toBe(' 手动问题 ');
  });

  test('tracks ASR input and final text for probes and prefetch', () => {
    const { hook, pipeline } = renderAsrInput();

    act(() => {
      hook.result().setInputTextFromAsr('ASR 临时文本');
      hook.result().handleAsrFinalText('  ASR 最终文本  ');
    });

    expect(hook.result().inputText).toBe('ASR 临时文本');
    expect(hook.result().lastAsrInputChangeAtRef.current).toBeGreaterThan(0);
    expect(hook.result().pendingAsrFinalTextRef.current).toBe('ASR 最终文本');
    expect(pipeline.setPendingAsrText).toHaveBeenCalledWith('ASR 最终文本');
    expect(hook.result().asrE2eProbeRef.current.lastFinalTextBeforePostProcess).toBe('ASR 最终文本');
  });

  test('processes accepted voice text and stores client events', async () => {
    const event = { type: 'filter', fields: { ok: true } };
    const { hook, pipeline, setQueueStatus } = renderAsrInput({
      processImpl: jest.fn(async ({ onStatusChange, onStageChange, onEvent }) => {
        onStatusChange('processing_asr_text');
        onStageChange('filtering');
        onEvent(event);
        return {
          accepted: true,
          text: '通过文本',
          correctedText: '通过文本',
          reason: 'ok',
          feedback: '',
          stage: 'accepted',
        };
      }),
    });

    let result;
    await act(async () => {
      result = await hook.result().preprocessVoiceText({ text: ' 原文本 ', trigger: 'auto' });
    });

    expect(result).toBe('通过文本');
    expect(pipeline.process).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '原文本',
        trigger: 'auto',
        wakeWordEnabled: true,
        wakeWord: '小导游',
        asrTextFilterEnabled: true,
      })
    );
    expect(hook.result().inputText).toBe('通过文本');
    expect(hook.result().asrPostProcessEvents).toEqual([event]);
    expect(hook.result().consumePendingAsrClientEvents()).toEqual([event]);
    expect(hook.result().consumePendingAsrClientEvents()).toEqual([]);
    expect(setQueueStatus).toHaveBeenCalledWith('正在过滤和纠错 ASR 文本...');
    expect(hook.result().asrE2eProbeRef.current.lastPostProcessResult).toEqual(
      expect.objectContaining({
        originalText: '原文本',
        trigger: 'auto',
        accepted: true,
        text: '通过文本',
      })
    );
  });

  test('clears input and shows wake-word feedback when voice text is rejected', async () => {
    const showTransientQueueStatus = jest.fn();
    const pipeline = {
      clearPendingAsrText: jest.fn(),
      setPendingAsrText: jest.fn(),
      getWakeHoldUntilMs: jest.fn(() => 0),
      process: jest.fn().mockResolvedValue({
        accepted: false,
        text: '',
        correctedText: '',
        reason: 'wake_missing',
        feedback: 'wake_word_missing',
        stage: 'rejected',
      }),
    };
    const hook = renderHook((props) => useAppShellAsrInput(props), {
      createPipeline: () => pipeline,
      setQueueStatus: jest.fn(),
      showTransientQueueStatus,
    });

    await act(async () => {
      await hook.result().preprocessVoiceText({ text: '没有唤醒词' });
    });

    expect(hook.result().inputText).toBe('');
    expect(showTransientQueueStatus).toHaveBeenCalledWith('未检测到唤醒词');
    expect(hook.result().asrE2eProbeRef.current.inputText).toBe('');
  });
});
