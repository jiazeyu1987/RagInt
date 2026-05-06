import { TOUR_BTN_MODE } from './appShellState';
import { renderHook } from '../testUtils/renderHook';
import { useAppShellVoiceResumeGuards } from './useAppShellVoiceResumeGuards';

describe('useAppShellVoiceResumeGuards', () => {
  function createProps(overrides = {}) {
    return {
      askAbortRef: { current: null },
      currentAudioRef: { current: null },
      ttsManagerRef: { current: null },
      tourPipelineRef: { current: null },
      tourStateRef: { current: { mode: 'idle', stopIndex: 0 } },
      lastAsrInputChangeAtRef: { current: 0 },
      isLoading: false,
      ...overrides,
    };
  }

  test('detects active ask, loading, audio, TTS, and tour pipeline work', () => {
    expect(renderHook((props) => useAppShellVoiceResumeGuards(props), createProps()).result().isRunActiveForBargeIn()).toBe(
      false
    );
    expect(
      renderHook((props) => useAppShellVoiceResumeGuards(props), createProps({ askAbortRef: { current: {} } }))
        .result()
        .isRunActiveForBargeIn()
    ).toBe(true);
    expect(
      renderHook((props) => useAppShellVoiceResumeGuards(props), createProps({ isLoading: true }))
        .result()
        .isRunActiveForBargeIn()
    ).toBe(true);
    expect(
      renderHook((props) => useAppShellVoiceResumeGuards(props), createProps({ currentAudioRef: { current: {} } }))
        .result()
        .isRunActiveForBargeIn()
    ).toBe(true);
    expect(
      renderHook(
        (props) => useAppShellVoiceResumeGuards(props),
        createProps({ ttsManagerRef: { current: { isBusy: () => true } } })
      )
        .result()
        .isRunActiveForBargeIn()
    ).toBe(true);
    expect(
      renderHook(
        (props) => useAppShellVoiceResumeGuards(props),
        createProps({ tourPipelineRef: { current: { isActive: () => true } } })
      )
        .result()
        .isRunActiveForBargeIn()
    ).toBe(true);
  });

  test('evaluates tour auto-resume state using current tour ref and run activity', () => {
    const paused = renderHook(
      (props) => useAppShellVoiceResumeGuards(props),
      createProps({ tourStateRef: { current: { mode: 'paused', stopIndex: 1 } } })
    ).result();
    expect(paused.canAutoResumeTour()).toBe(true);
    expect(paused.shouldAutoResumeTour()).toBe(false);

    const activePaused = renderHook(
      (props) => useAppShellVoiceResumeGuards(props),
      createProps({
        tourStateRef: { current: { mode: 'paused', stopIndex: 1 } },
        ttsManagerRef: { current: { isBusy: () => true } },
      })
    ).result();
    expect(activePaused.shouldAutoResumeTour()).toBe(true);

    const running = renderHook(
      (props) => useAppShellVoiceResumeGuards(props),
      createProps({ tourStateRef: { current: { mode: 'running', stopIndex: 1 } } })
    ).result();
    expect(running.shouldAutoResumeTour()).toBe(true);

    const idle = renderHook(
      (props) => useAppShellVoiceResumeGuards(props),
      createProps({ tourStateRef: { current: { mode: TOUR_BTN_MODE.START, stopIndex: -1 } } })
    ).result();
    expect(idle.canAutoResumeTour()).toBe(false);
  });

  test('treats ASR input as busy within the recent input window', () => {
    const now = Date.now();
    const recent = renderHook(
      (props) => useAppShellVoiceResumeGuards(props),
      createProps({ lastAsrInputChangeAtRef: { current: now - 100 } })
    ).result();
    expect(recent.isAsrBusyForResume()).toBe(true);

    const old = renderHook(
      (props) => useAppShellVoiceResumeGuards(props),
      createProps({ lastAsrInputChangeAtRef: { current: now - 1000 } })
    ).result();
    expect(old.isAsrBusyForResume()).toBe(false);
  });
});
