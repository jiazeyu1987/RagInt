import { useEffect, useMemo, useState } from 'react';
import { PressToTalkAsrModule } from '../voice/PressToTalkAsrModule';
import { VOICE_DEBUG, WAKE_HOLD_MS } from '../config/features';

export function useVoiceInputManager({
  providerType = 'voicekit_ws',
  baseUrl,
  minRecordMs = 900,
  asrStopGraceMs = 480,
  asrFinalWaitMs = 1500,
  asrFinalTimeoutStrategy = 'keep_partial',
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
  saucWsUrl,
  saucResourceId,
  saucAppKey,
  saucAccessKey,
  saucModelName,
  saucSegmentDurationMs,
  saucEnableItn,
  saucEnablePunc,
  saucEnableDdc,
  saucShowUtterances,
  saucEnableNonstream,
  onWakeWordFeedback,
  onAsrFinalText,
  askQuestion,
  submitText,
  isLoading,
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionStage, setRecognitionStage] = useState('idle');
  const [hasUserGesture, setHasUserGesture] = useState(false);
  const [isManualHold, setIsManualHold] = useState(false);
  const manager = useMemo(
    () =>
      new PressToTalkAsrModule({
        providerType,
        onLog: (...args) => (VOICE_DEBUG ? console.log(...args) : null),
      }),
    [providerType]
  );

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
      // Wake word is judged after ASR correction on the frontend.
      wsRequireWake: false,
      asrStopGraceMs,
      asrFinalWaitMs,
      asrFinalTimeoutStrategy,
      wakeWord,
      wakeWordStrict,
      wakeWordCooldownMs,
      providerType,
      saucWsUrl,
      saucResourceId,
      saucAppKey,
      saucAccessKey,
      saucModelName,
      saucSegmentDurationMs,
      saucEnableItn,
      saucEnablePunc,
      saucEnableDdc,
      saucShowUtterances,
      saucEnableNonstream,
      onWakeWordFeedback,
      onFinalText: onAsrFinalText,
      wakeHoldMs: WAKE_HOLD_MS,
      onRecordingChange: (value) => setIsRecording(!!value),
    };
    manager.configure({
      ...deps,
      onCaptureChange: (value) => setIsRecording(!!value),
      onRecognizingChange: (value) => setIsRecognizing(!!value),
      onAsrStageChange: (stage) => setRecognitionStage(String(stage || 'idle').trim() || 'idle'),
    });
  }, [
    audioContextRef,
    asrFinalWaitMs,
    asrFinalTimeoutStrategy,
    asrStopGraceMs,
    baseUrl,
    clientIdRef,
    decodeAndConvertToWav16kMono,
    getInputText,
    minRecordMs,
    manager,
    onWakeWordFeedback,
    onAsrFinalText,
    providerType,
    setInputText,
    setIsLoading,
    ttsEnabledRef,
    unlockAudio,
    saucWsUrl,
    saucResourceId,
    saucAppKey,
    saucAccessKey,
    saucModelName,
    saucSegmentDurationMs,
    saucEnableItn,
    saucEnablePunc,
    saucEnableDdc,
    saucShowUtterances,
    saucEnableNonstream,
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
          isRecognizing: !!isRecognizing,
          recognitionStage,
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
    isRecognizing,
    recognitionStage,
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
    isRecognizing,
    recognitionStage,
    isWakeWordRunning: false,
    startRecording: () => manager.startCapture(),
    stopRecording: () => manager.stopCapture(),
    recordOnce: (opts) => manager.recordOnce(opts),
    onRecordPointerDown: async (e) => {
      try {
        setIsManualHold(true);
      } catch (_) {
        // ignore
      }
      return manager.onPointerDown(e);
    },
    onRecordPointerUp: (e) => {
      try {
        setIsManualHold(false);
      } catch (_) {
        // ignore
      }
      return manager.onPointerUp(e);
    },
    onRecordPointerCancel: () => {
      try {
        setIsManualHold(false);
      } catch (_) {
        // ignore
      }
      return manager.onPointerCancel();
    },
  };
}
