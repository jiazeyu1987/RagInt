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

  test('accepts fuzzy wake word near prefix', async () => {
    const pipeline = new AsrPostProcessPipeline({ now: () => 1000, wakeHoldMs: 5000 });
    pipeline.setPendingAsrText('你好小助守 介绍一下展品');

    const result = await pipeline.process({
      text: '你好小助守 介绍一下展品',
      trigger: 'wake_word',
      wakeWordEnabled: true,
      wakeWord: '你好小助手',
      wakeWordStrict: false,
      asrTextFilterEnabled: false,
    });

    expect(result.accepted).toBe(true);
    expect(result.text).toBe('介绍一下展品');
  });
  test('fails fast when ASR filter returns an invalid model output', async () => {
    const filterAsrText = jest.fn().mockResolvedValue({ text: '   ' });
    const pipeline = new AsrPostProcessPipeline({ filterAsrText });
    pipeline.setPendingAsrText('raw asr text');

    await expect(
      pipeline.process({
        text: 'raw asr text',
        trigger: 'voice',
        asrTextFilterEnabled: true,
        asrTextFilterPrompt: 'prompt',
        asrTextFilterChatName: 'voice model',
      })
    ).rejects.toThrow('ASR filter returned invalid text');
  });

  test('surfaces ASR filter failures instead of accepting raw text', async () => {
    const filterAsrText = jest.fn().mockRejectedValue(new Error('model unavailable'));
    const events = [];
    const pipeline = new AsrPostProcessPipeline({ filterAsrText, now: () => 1234 });
    pipeline.setPendingAsrText('raw asr text');

    await expect(
      pipeline.process({
        text: 'raw asr text',
        trigger: 'voice',
        asrTextFilterEnabled: true,
        asrTextFilterPrompt: 'prompt',
        asrTextFilterChatName: 'voice model',
        onEvent: (event) => events.push(event),
      })
    ).rejects.toThrow('model unavailable');

    expect(events.map((event) => event.name)).toContain('filtering_failed');
    expect(events.find((event) => event.name === 'filtering_failed').fields.error).toBe('model unavailable');
  });

  test('prefetch exposes ASR filter failures instead of returning raw text', async () => {
    const filterAsrText = jest.fn().mockRejectedValue(new Error('prefetch backend down'));
    const pipeline = new AsrPostProcessPipeline({ filterAsrText });

    await expect(
      pipeline.prefetchFilter({
        text: 'raw asr text',
        asrTextFilterEnabled: true,
        asrTextFilterPrompt: 'prompt',
        asrTextFilterChatName: 'voice model',
      })
    ).rejects.toThrow('prefetch backend down');
  });
});
