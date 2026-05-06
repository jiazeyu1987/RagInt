import { useCallback } from 'react';
import { TOUR_BTN_MODE, reduceTourButtonState } from './appShellState';

export function useTourToggleActions({
  tourButtonState = {},
  setTourButtonState,
  onInterruptManual,
  continueTour,
  startTour,
  prepareTourRagflowConversation,
  markRagflowAvailable,
  markRagflowUnavailable,
  onResetAll,
} = {}) {
  const onTourToggle = useCallback(async () => {
    if (tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT) {
      onInterruptManual();
      setTourButtonState((state) => reduceTourButtonState(state, { type: 'INTERRUPT_CLICK' }));
      return;
    }
    if (tourButtonState.mode === TOUR_BTN_MODE.CONTINUE) {
      setTourButtonState((state) => reduceTourButtonState(state, { type: 'CONTINUE_CLICK' }));
      try {
        await continueTour();
        markRagflowAvailable();
      } catch (error) {
        markRagflowUnavailable({ source: 'tour_continue', error });
        setTourButtonState((state) => ({ ...(state || {}), mode: TOUR_BTN_MODE.CONTINUE }));
      }
      return;
    }
    setTourButtonState((state) => reduceTourButtonState(state, { type: 'START_CLICK' }));
    try {
      prepareTourRagflowConversation();
      await startTour();
      markRagflowAvailable();
    } catch (error) {
      markRagflowUnavailable({ source: 'tour_start', error });
      setTourButtonState({ started: false, mode: TOUR_BTN_MODE.START });
    }
  }, [
    tourButtonState,
    setTourButtonState,
    onInterruptManual,
    continueTour,
    startTour,
    prepareTourRagflowConversation,
    markRagflowAvailable,
    markRagflowUnavailable,
  ]);

  const simpleTourRunning = !!(tourButtonState && tourButtonState.started);
  const onSimpleTourToggle = useCallback(async () => {
    if (simpleTourRunning) {
      await onResetAll();
      return;
    }
    setTourButtonState((state) => reduceTourButtonState(state, { type: 'START_CLICK' }));
    try {
      prepareTourRagflowConversation();
      await startTour();
      markRagflowAvailable();
    } catch (error) {
      markRagflowUnavailable({ source: 'simple_tour_start', error });
      setTourButtonState({ started: false, mode: TOUR_BTN_MODE.START });
    }
  }, [
    simpleTourRunning,
    onResetAll,
    setTourButtonState,
    prepareTourRagflowConversation,
    startTour,
    markRagflowAvailable,
    markRagflowUnavailable,
  ]);

  return {
    onTourToggle,
    onSimpleTourToggle,
    simpleTourRunning,
  };
}
