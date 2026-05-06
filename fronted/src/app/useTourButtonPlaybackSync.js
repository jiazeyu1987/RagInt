import { useCallback, useEffect, useRef } from 'react';
import { reduceTourButtonState } from './appShellState';

function isTourPlaybackActive({ isLoading, askAbortRef, currentAudioRef, ttsManagerRef, tourState } = {}) {
  const ttsManager = ttsManagerRef && ttsManagerRef.current;
  return (
    !!isLoading
    || !!(askAbortRef && askAbortRef.current)
    || !!(currentAudioRef && currentAudioRef.current)
    || !!(ttsManager && ttsManager.isBusy && ttsManager.isBusy())
    || String((tourState && tourState.mode) || '') === 'running'
  );
}

export function useTourButtonPlaybackSync({
  isLoading = false,
  askAbortRef,
  currentAudioRef,
  ttsManagerRef,
  tourState,
  setTourButtonState,
} = {}) {
  const wasTourActiveRef = useRef(false);
  const resetTourButtonPlaybackActivity = useCallback(() => {
    wasTourActiveRef.current = false;
  }, []);

  useEffect(() => {
    const active = isTourPlaybackActive({
      isLoading,
      askAbortRef,
      currentAudioRef,
      ttsManagerRef,
      tourState,
    });
    const prev = !!wasTourActiveRef.current;
    if (!prev && active) {
      setTourButtonState((state) => reduceTourButtonState(state, { type: 'PLAYBACK_STARTED' }));
    } else if (prev && !active) {
      setTourButtonState((state) => reduceTourButtonState(state, { type: 'PLAYBACK_STOPPED' }));
    }
    wasTourActiveRef.current = active;
  }, [isLoading, tourState, askAbortRef, currentAudioRef, ttsManagerRef, setTourButtonState]);

  return {
    resetTourButtonPlaybackActivity,
  };
}
