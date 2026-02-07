import { useEffect, useRef, useState } from 'react';
import { VoiceInputManager } from '../managers/VoiceInputManager';
import { VOICE_DEBUG, WAKE_HOLD_MS } from '../config/features';

export function useVoiceInputManager({
  baseUrl,
  minRecordMs = 900,
  clientIdRef,
  setInputText,
  getInputText,
  setIsLoading,
  decodeAndConvertToWav16kMono,
  unlockAudio,
  ttsEnabledRef,
  audioContextRef,
  wakeWordEnabled,
  wakeWord,
  wakeWordStrict,
  wakeWordCooldownMs,
  onWakeWordFeedback,
  askQuestion,
  submitText,
  isLoading,
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasUserGesture, setHasUserGesture] = useState(false);
  const [isManualHold, setIsManualHold] = useState(false);
  const managerRef = useRef(null);
  if (!managerRef.current) {
    managerRef.current = new VoiceInputManager({ onLog: (...args) => (VOICE_DEBUG ? console.log(...args) : null) });
  }
  const manager = managerRef.current;

  useEffect(() => {
    if (hasUserGesture) return () => {};
    if (typeof window === 'undefined') return () => {};
    const mark = () => {
      try {
        setHasUserGesture(true);
      } catch (_) {
        // ignore
      }
    };
    window.addEventListener('pointerdown', mark, { capture: true, once: true });
    window.addEventListener('keydown', mark, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', mark, { capture: true });
      window.removeEventListener('keydown', mark, { capture: true });
    };
  }, [hasUserGesture]);

  useEffect(() => {
    return () => {
      manager.dispose();
    };
  }, [manager]);

  const callbacksRef = useRef({
    setInputText,
    getInputText,
    onFeedback: onWakeWordFeedback,
  });

  useEffect(() => {
    callbacksRef.current = {
      setInputText,
      getInputText,
      onFeedback: onWakeWordFeedback,
    };
  }, [getInputText, onWakeWordFeedback, setInputText]);

  useEffect(() => {
    const deps = {
      baseUrl,
      minRecordMs,
      clientId: clientIdRef ? clientIdRef.current : '',
      setInputText,
      getInputText,
      setIsLoading,
      decodeAndConvertToWav16kMono,
      unlockAudio,
      ttsEnabledRef,
      audioContextRef,
      wsRequireWake: !!wakeWordEnabled,
      wakeWord,
      wakeWordStrict,
      wakeWordCooldownMs,
      onWakeWordFeedback,
      wakeHoldMs: WAKE_HOLD_MS,
      onRecordingChange: (value) => setIsRecording(!!value),
    };
    manager.setRecordingDeps(deps);
  }, [
    audioContextRef,
    baseUrl,
    clientIdRef,
    decodeAndConvertToWav16kMono,
    getInputText,
    minRecordMs,
    manager,
    onWakeWordFeedback,
    setInputText,
    setIsLoading,
    ttsEnabledRef,
    unlockAudio,
    wakeWord,
    wakeWordCooldownMs,
    wakeWordEnabled,
    wakeWordStrict,
  ]);

  const resolvedClientId = clientIdRef ? clientIdRef.current : '';
  useEffect(() => {
    if (VOICE_DEBUG) {
      try {
        // eslint-disable-next-line no-console
        console.log('[VOICE] wake_opts', {
          wakeWordEnabled: !!wakeWordEnabled,
          hasUserGesture: !!hasUserGesture,
          isManualHold: !!isManualHold,
          isRecording: !!isRecording,
          enabled: !!wakeWordEnabled && !!hasUserGesture && !isManualHold && !isRecording,
        });
      } catch (_) {
        // ignore
      }
    }
  }, [
    baseUrl,
    hasUserGesture,
    isManualHold,
    isRecording,
    manager,
    resolvedClientId,
    wakeWord,
    wakeWordCooldownMs,
    wakeWordEnabled,
    wakeWordStrict,
    // `process.env` is compile-time in CRA, keep it as a dep for clarity.
  ]);

  return {
    isRecording,
    isWakeWordRunning: false,
    startRecording: () => manager.startRecording(),
    stopRecording: () => manager.stopRecording(),
    recordOnce: (opts) => manager.recordOnce(opts),
    onRecordPointerDown: async (e) => {
      try {
        setIsManualHold(true);
      } catch (_) {
        // ignore
      }
      return manager.onRecordPointerDown(e);
    },
    onRecordPointerUp: (e) => {
      try {
        setIsManualHold(false);
      } catch (_) {
        // ignore
      }
      return manager.onRecordPointerUp(e);
    },
    onRecordPointerCancel: () => {
      try {
        setIsManualHold(false);
      } catch (_) {
        // ignore
      }
      return manager.onRecordPointerCancel();
    },
  };
}
