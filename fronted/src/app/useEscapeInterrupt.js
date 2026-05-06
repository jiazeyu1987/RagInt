import { useEffect } from 'react';

export function useEscapeInterrupt({
  isLoading = false,
  askAbortRef,
  ttsManagerRef,
  currentAudioRef,
  getRunCoordinator,
} = {}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!event || event.key !== 'Escape') return;
      const ttsManager = ttsManagerRef && ttsManagerRef.current;
      const hasActiveRun =
        !!(askAbortRef && askAbortRef.current)
        || !!isLoading
        || !!(ttsManager && ttsManager.isBusy && ttsManager.isBusy())
        || !!(currentAudioRef && currentAudioRef.current);
      if (!hasActiveRun) return;
      try {
        event.preventDefault();
      } catch (_) {
        // ignore
      }
      getRunCoordinator().interruptEscape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLoading, askAbortRef, ttsManagerRef, currentAudioRef, getRunCoordinator]);
}
