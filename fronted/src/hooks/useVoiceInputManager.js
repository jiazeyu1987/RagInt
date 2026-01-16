import { useEffect, useRef, useState } from 'react';
import { VoiceInputManager } from '../managers/VoiceInputManager';
import { VOICE_DEBUG, WAKE_WORD_FEATURE_ENABLED } from '../config/features';

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
  asrMode = 'ws_pcm',
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
  const [isWakeWordRunning, setIsWakeWordRunning] = useState(false);
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

  useEffect(() => {
    manager.setWakeWordStateListener((active) => {
      setIsWakeWordRunning(!!active);
    });
  }, [manager]);

  const callbacksRef = useRef({
    askQuestion,
    submitText,
    onFeedback: onWakeWordFeedback,
  });

  useEffect(() => {
    manager.setWakeWordCallbacks(callbacksRef);
  }, [manager]);

  useEffect(() => {
    callbacksRef.current = {
      askQuestion,
      submitText,
      onFeedback: onWakeWordFeedback,
    };
  }, [askQuestion, submitText, onWakeWordFeedback]);

  useEffect(() => {
    manager.setWakeWordBusyChecker(() => !!isLoading);
  }, [manager, isLoading]);

  useEffect(() => {
    const deps = {
      baseUrl,
      minRecordMs,
      asrMode,
      clientId: clientIdRef ? clientIdRef.current : '',
      setInputText,
      getInputText,
      setIsLoading,
      decodeAndConvertToWav16kMono,
      unlockAudio,
      ttsEnabledRef,
      audioContextRef,
      onRecordingChange: (value) => setIsRecording(!!value),
    };
    manager.setRecordingDeps(deps);
  }, [
    asrMode,
    audioContextRef,
    baseUrl,
    clientIdRef,
    decodeAndConvertToWav16kMono,
    getInputText,
    minRecordMs,
    manager,
    setInputText,
    setIsLoading,
    ttsEnabledRef,
    unlockAudio,
  ]);

  const resolvedClientId = clientIdRef ? clientIdRef.current : '';
  useEffect(() => {
    if (VOICE_DEBUG) {
      try {
        // eslint-disable-next-line no-console
        console.log('[VOICE] wake_opts', {
          wakeWordEnabled: !!wakeWordEnabled,
          wakeFeatureEnabled: !!WAKE_WORD_FEATURE_ENABLED,
          hasUserGesture: !!hasUserGesture,
          isManualHold: !!isManualHold,
          isRecording: !!isRecording,
          enabled: !!WAKE_WORD_FEATURE_ENABLED && !!wakeWordEnabled && !!hasUserGesture && !isManualHold && !isRecording,
        });
      } catch (_) {
        // ignore
      }
    }
    manager.setWakeWordOptions({
      // Avoid concurrent mic usage: pause wake-word listener while manual recording is active.
      enabled: !!WAKE_WORD_FEATURE_ENABLED && !!wakeWordEnabled && !!hasUserGesture && !isManualHold && !isRecording,
      baseUrl,
      clientId: resolvedClientId,
      wakeWord,
      strictMode: !!wakeWordStrict,
      cooldownMs: Number(wakeWordCooldownMs) || 0,
      continuous: true,
    });
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
    WAKE_WORD_FEATURE_ENABLED,
  ]);

  return {
    isRecording,
    isWakeWordRunning,
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
