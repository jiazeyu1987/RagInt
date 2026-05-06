import { useCallback } from 'react';

export function useAppShellBrowserServices({
  clientIdRef,
  audioContextRef,
  cancelRequest,
  decodeAndConvertToWav16kMono: decodeAndConvertToWav16kMonoImpl,
  unlockAudio: unlockAudioImpl,
  preferredTtsSampleRate = 16000,
} = {}) {
  const cancelBackendRequest = useCallback(
    (requestId, reason) => {
      cancelRequest({ requestId, clientId: clientIdRef.current, reason });
    },
    [cancelRequest, clientIdRef]
  );

  const decodeAndConvertToWav16kMono = useCallback(
    async (blob) => decodeAndConvertToWav16kMonoImpl(blob),
    [decodeAndConvertToWav16kMonoImpl]
  );

  const unlockAudio = useCallback(() => {
    unlockAudioImpl(audioContextRef, preferredTtsSampleRate);
  }, [audioContextRef, preferredTtsSampleRate, unlockAudioImpl]);

  return {
    cancelBackendRequest,
    decodeAndConvertToWav16kMono,
    unlockAudio,
  };
}
