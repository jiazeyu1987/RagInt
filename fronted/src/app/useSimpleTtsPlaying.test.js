import { renderHook } from '../testUtils/renderHook';
import { act } from 'react';
import { useSimpleTtsPlaying } from './useSimpleTtsPlaying';

describe('useSimpleTtsPlaying', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('polls audio ref only in simple mode and clears outside simple mode', () => {
    const currentAudioRef = { current: null };
    const hook = renderHook((props) => useSimpleTtsPlaying(props), { uiViewMode: 'simple', currentAudioRef });

    expect(hook.result()).toBe(false);
    currentAudioRef.current = { id: 'audio' };
    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(hook.result()).toBe(true);

    hook.rerender({ uiViewMode: 'full', currentAudioRef });
    expect(hook.result()).toBe(false);

    hook.unmount();
  });
});
