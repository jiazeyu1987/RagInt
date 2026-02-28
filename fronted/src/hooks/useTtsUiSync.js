import { useEffect } from 'react';

export function useTtsUiSync({
  ttsEnabled,
  ttsEnabledRef,
  currentAudioRef,
  ttsManagerRef,
  setQueueStatus,
  ttsMode,
  modelscopeVoice,
  ttsSpeed,
  ttsFetchConcurrency,
} = {}) {
  useEffect(() => {
    ttsEnabledRef.current = !!ttsEnabled;

    if (!ttsEnabled) {
      try {
        if (currentAudioRef.current) {
          if (typeof currentAudioRef.current.stop === 'function') {
            currentAudioRef.current.stop();
          } else if (typeof currentAudioRef.current.pause === 'function') {
            currentAudioRef.current.pause();
            currentAudioRef.current.src = '';
          }
        }
      } catch (_) {
        // ignore
      } finally {
        currentAudioRef.current = null;
      }

      if (ttsManagerRef.current) {
        ttsManagerRef.current.stop('tts_disabled');
      }
      setQueueStatus('');
    }
  }, [ttsEnabled, ttsEnabledRef, currentAudioRef, ttsManagerRef, setQueueStatus]);

  useEffect(() => {
    try {
      const mgr = ttsManagerRef.current;
      if (mgr && typeof mgr.setTtsProvider === 'function') mgr.setTtsProvider(ttsMode, 'ui_change');
    } catch (_) {
      // ignore
    }
  }, [ttsMode, ttsManagerRef]);

  useEffect(() => {
    try {
      const mgr = ttsManagerRef.current;
      if (mgr && typeof mgr.setTtsVoice === 'function') {
        mgr.setTtsVoice(ttsMode === 'modelscope' || ttsMode === 'flash' ? modelscopeVoice : '', 'ui_change');
      }
    } catch (_) {
      // ignore
    }
  }, [ttsMode, modelscopeVoice, ttsManagerRef]);

  useEffect(() => {
    try {
      const mgr = ttsManagerRef.current;
      if (mgr && typeof mgr.setTtsSpeed === 'function') mgr.setTtsSpeed(ttsSpeed, 'ui_change');
    } catch (_) {
      // ignore
    }
  }, [ttsSpeed, ttsManagerRef]);

  useEffect(() => {
    try {
      const mgr = ttsManagerRef.current;
      if (mgr && typeof mgr.setFetchConcurrency === 'function') mgr.setFetchConcurrency(ttsFetchConcurrency, 'ui_change');
    } catch (_) {
      // ignore
    }
  }, [ttsFetchConcurrency, ttsManagerRef]);
}
