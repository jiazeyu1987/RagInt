import { AsrPostProcessPipeline } from './AsrPostProcessPipeline';

describe('AsrPostProcessPipeline', () => {
  test('bypasses non-pending text', async () => {
    const pipeline = new AsrPostProcessPipeline();

    const result = await pipeline.process({
      text: 'manual input',
      trigger: 'text',
    });

    expect(result).toEqual({
      accepted: true,
      text: 'manual input',
      correctedText: 'manual input',
      reason: 'bypass_non_asr',
      stage: 'bypass_non_asr',
    });
  });

  test('filters ASR text and strips wake word', async () => {
    const filterAsrText = jest.fn().mockResolvedValue({ text: '你好小助手 介绍一下指引导丝' });
    const stages = [];
    const events = [];
    const pipeline = new AsrPostProcessPipeline({
      filterAsrText,
      now: () => 1000,
      wakeHoldMs: 5000,
    });
    pipeline.setPendingAsrText('你好小助手 介绍一下指引导致');

    const result = await pipeline.process({
      text: '你好小助手 介绍一下指引导致',
      trigger: 'text',
      wakeWordEnabled: true,
      wakeWord: '你好小助手',
      wakeWordStrict: false,
      asrTextFilterEnabled: true,
      asrTextFilterPrompt: 'prompt',
      asrTextFilterChatName: 'voice model',
      asrTextFilterTerms: '指引导丝',
      onStageChange: (stage) => stages.push(stage),
      onEvent: (event) => events.push(event),
    });

    expect(filterAsrText).toHaveBeenCalled();
    expect(result.accepted).toBe(true);
    expect(result.text).toBe('介绍一下指引导丝');
    expect(result.correctedText).toBe('你好小助手 介绍一下指引导丝');
    expect(pipeline.getWakeHoldUntilMs()).toBe(6000);
    expect(stages).toEqual(['pending_asr_matched', 'filtering', 'accepted']);
    expect(events.map((item) => item.name)).toEqual([
      'pending_asr_matched',
      'filtering_started',
      'filtering_finished',
      'accepted',
    ]);
  });

  test('rejects text when wake word is required but missing', async () => {
    const pipeline = new AsrPostProcessPipeline({ now: () => 1000, wakeHoldMs: 5000 });
    pipeline.setPendingAsrText('介绍一下指引导丝');

    const result = await pipeline.process({
      text: '介绍一下指引导丝',
      trigger: 'voice',
      wakeWordEnabled: true,
      wakeWord: '你好小助手',
      wakeWordStrict: false,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('wake_word_missing');
    expect(result.feedback).toBe('wake_word_missing');
  });

  test('reuses prefetched filter result at submit time', async () => {
    const filterAsrText = jest.fn().mockResolvedValue({ text: '你好小助手 介绍一下指引导丝' });
    const pipeline = new AsrPostProcessPipeline({
      filterAsrText,
      now: () => 1000,
      wakeHoldMs: 5000,
    });
    pipeline.setPendingAsrText('你好小助手 介绍一下指引导致');

    const prefetched = await pipeline.prefetchFilter({
      text: '你好小助手 介绍一下指引导致',
      wakeWordEnabled: true,
      wakeWord: '你好小助手',
      asrTextFilterEnabled: true,
      asrTextFilterPrompt: 'prompt',
      asrTextFilterChatName: 'voice model',
      asrTextFilterTerms: '指引导丝',
    });
    expect(prefetched.ok).toBe(true);

    const result = await pipeline.process({
      text: '你好小助手 介绍一下指引导致',
      trigger: 'text',
      wakeWordEnabled: true,
      wakeWord: '你好小助手',
      wakeWordStrict: false,
      asrTextFilterEnabled: true,
      asrTextFilterPrompt: 'prompt',
      asrTextFilterChatName: 'voice model',
      asrTextFilterTerms: '指引导丝',
    });

    expect(filterAsrText).toHaveBeenCalledTimes(1);
    expect(result.accepted).toBe(true);
    expect(result.text).toBe('介绍一下指引导丝');
  });
});
