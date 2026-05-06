import { renderHook } from '../testUtils/renderHook';
import { TOUR_BTN_MODE } from './appShellState';
import { useTourButtonPlaybackSync } from './useTourButtonPlaybackSync';

describe('useTourButtonPlaybackSync', () => {
  test('marks a started tour button as playing when activity starts and continuable when it stops', () => {
    const setTourButtonState = jest.fn((updater) => {
      const current = { started: true, mode: TOUR_BTN_MODE.CONTINUE };
      return typeof updater === 'function' ? updater(current) : updater;
    });
    const props = {
      isLoading: false,
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      tourState: { mode: 'idle' },
      setTourButtonState,
    };

    const hook = renderHook((nextProps) => useTourButtonPlaybackSync(nextProps), props);
    expect(setTourButtonState).not.toHaveBeenCalled();

    hook.rerender({ ...props, isLoading: true });
    expect(setTourButtonState).toHaveBeenCalledTimes(1);
    expect(setTourButtonState.mock.results[0].value).toEqual({ started: true, mode: TOUR_BTN_MODE.INTERRUPT });

    hook.rerender(props);
    expect(setTourButtonState).toHaveBeenCalledTimes(2);
    expect(setTourButtonState.mock.results[1].value).toEqual({ started: true, mode: TOUR_BTN_MODE.CONTINUE });
  });

  test('treats audio, tts manager, request abort, and running tour state as activity', () => {
    const setTourButtonState = jest.fn((updater) => updater({ started: true, mode: TOUR_BTN_MODE.CONTINUE }));
    const baseProps = {
      isLoading: false,
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      tourState: { mode: 'idle' },
      setTourButtonState,
    };

    const hook = renderHook((nextProps) => useTourButtonPlaybackSync(nextProps), baseProps);

    hook.rerender({ ...baseProps, currentAudioRef: { current: {} } });
    hook.rerender(baseProps);
    hook.rerender({ ...baseProps, ttsManagerRef: { current: { isBusy: () => true } } });
    hook.rerender(baseProps);
    hook.rerender({ ...baseProps, askAbortRef: { current: {} } });
    hook.rerender(baseProps);
    hook.rerender({ ...baseProps, tourState: { mode: 'running' } });

    expect(setTourButtonState).toHaveBeenCalledTimes(7);
  });
});
