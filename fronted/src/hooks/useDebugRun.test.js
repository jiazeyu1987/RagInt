import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useDebugRun } from './useDebugRun';

describe('useDebugRun', () => {
  test('beginDebugRun initializes debug info fields', () => {
    const hook = renderHook(() => useDebugRun());

    act(() => {
      hook.result().beginDebugRun('text');
    });

    const info = hook.result().debugInfo;
    expect(info).toEqual(
      expect.objectContaining({
        trigger: 'text',
        requestId: null,
        ragflowFirstChunkAt: null,
        ragflowFirstSegmentAt: null,
        ragflowDoneAt: null,
        ttsFirstRequestAt: null,
        ttsFirstAudioAt: null,
        ttsAllDoneAt: null,
        segments: [],
      })
    );
    expect(typeof info.submitAt).toBe('number');
    expect(hook.result().debugRef.current).toBeTruthy();
    hook.unmount();
  });

  test('debugMark sets each key only once', () => {
    const hook = renderHook(() => useDebugRun());

    act(() => {
      hook.result().beginDebugRun('wake_word');
    });
    act(() => {
      hook.result().debugMark('ragflowFirstChunkAt', 123);
    });
    act(() => {
      hook.result().debugMark('ragflowFirstChunkAt', 456);
    });

    expect(hook.result().debugInfo.ragflowFirstChunkAt).toBe(123);
    hook.unmount();
  });

  test('debugRefresh publishes latest ref snapshot', () => {
    const hook = renderHook(() => useDebugRun());

    act(() => {
      hook.result().beginDebugRun('text');
      hook.result().debugRef.current.segments.push({ seq: 1, chars: 8 });
      hook.result().debugRefresh();
    });

    expect(hook.result().debugInfo.segments).toEqual([{ seq: 1, chars: 8 }]);
    hook.unmount();
  });
});

