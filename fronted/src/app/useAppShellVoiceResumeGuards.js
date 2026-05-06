import { useCallback } from 'react';
import {
  buildRunActiveForBargeIn,
  canAutoResumeTourState,
  isRecentAsrInput,
  shouldAutoResumeTourState,
} from './appShellState';

export function useAppShellVoiceResumeGuards({
  askAbortRef,
  currentAudioRef,
  ttsManagerRef,
  tourPipelineRef,
  tourStateRef,
  lastAsrInputChangeAtRef,
  isLoading = false,
} = {}) {
  const isRunActiveForBargeIn = useCallback(() => {
    return buildRunActiveForBargeIn({
      askActive: !!(askAbortRef && askAbortRef.current),
      loading: !!isLoading,
      audioActive: !!(currentAudioRef && currentAudioRef.current),
      ttsBusy:
        !!(ttsManagerRef && ttsManagerRef.current && ttsManagerRef.current.isBusy && ttsManagerRef.current.isBusy()),
      pipelineActive:
        !!(
          tourPipelineRef &&
          tourPipelineRef.current &&
          tourPipelineRef.current.isActive &&
          tourPipelineRef.current.isActive()
        ),
    });
  }, [askAbortRef, currentAudioRef, isLoading, tourPipelineRef, ttsManagerRef]);

  const canAutoResumeTour = useCallback(() => {
    return canAutoResumeTourState(tourStateRef && tourStateRef.current ? tourStateRef.current : null);
  }, [tourStateRef]);

  const shouldAutoResumeTour = useCallback(() => {
    return shouldAutoResumeTourState({
      tourState: tourStateRef && tourStateRef.current ? tourStateRef.current : null,
      runActive: isRunActiveForBargeIn(),
    });
  }, [isRunActiveForBargeIn, tourStateRef]);

  const isAsrBusyForResume = useCallback(() => {
    return isRecentAsrInput({
      lastChangeAtMs: lastAsrInputChangeAtRef.current,
      nowMs: Date.now(),
      windowMs: 700,
    });
  }, [lastAsrInputChangeAtRef]);

  return {
    isRunActiveForBargeIn,
    canAutoResumeTour,
    shouldAutoResumeTour,
    isAsrBusyForResume,
  };
}
