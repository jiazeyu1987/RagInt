import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useAsrFilterPrefetch } from './useAsrFilterPrefetch';

describe('useAsrFilterPrefetch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderPrefetch(overrides = {}) {
    const pipeline = {
      prefetchFilter: jest.fn().mockResolvedValue({ ok: true }),
    };
    const pendingAsrFinalTextRef = { current: '请介绍展品' };
    const props = {
      inputText: '请介绍展品',
      pendingAsrFinalTextRef,
      isRecognizing: true,
      recognitionStage: 'receiving_partial',
      asrTextFilterEnabled: true,
      asrTextFilterPrompt: '纠错',
      asrTextFilterChatName: '展厅聊天',
      asrTextFilterTerms: '展品',
      wakeWordEnabled: true,
      wakeWord: '小导游',
      pipelineRef: { current: pipeline },
      ...overrides,
    };
    return { hook: renderHook((nextProps) => useAsrFilterPrefetch(nextProps), props), pipeline, props };
  }

  test('prefetches matching active ASR text after the delay', () => {
    const { pipeline } = renderPrefetch();

    expect(pipeline.prefetchFilter).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(pipeline.prefetchFilter).toHaveBeenCalledWith({
      text: '请介绍展品',
      wakeWordEnabled: true,
      wakeWord: '小导游',
      asrTextFilterEnabled: true,
      asrTextFilterPrompt: '纠错',
      asrTextFilterChatName: '展厅聊天',
      asrTextFilterTerms: '展品',
    });
  });

  test('does not prefetch when ASR is inactive or text no longer matches pending final text', () => {
    const inactive = renderPrefetch({ isRecognizing: false, recognitionStage: 'idle' });
    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(inactive.pipeline.prefetchFilter).not.toHaveBeenCalled();

    const mismatched = renderPrefetch({ inputText: '别的内容' });
    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(mismatched.pipeline.prefetchFilter).not.toHaveBeenCalled();
  });

  test('cancels the previous pending prefetch when dependencies change', () => {
    const { hook, pipeline, props } = renderPrefetch();

    hook.rerender({
      ...props,
      inputText: '请介绍展品二',
      pendingAsrFinalTextRef: { current: '请介绍展品二' },
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(pipeline.prefetchFilter).toHaveBeenCalledTimes(1);
    expect(pipeline.prefetchFilter.mock.calls[0][0].text).toBe('请介绍展品二');
  });
});
