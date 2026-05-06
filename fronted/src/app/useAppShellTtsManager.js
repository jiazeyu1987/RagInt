import { useCallback } from 'react';
import { createTtsOnStopIndexChange } from '../managers/createTtsOnStopIndexChange';
import { createOrGetTtsManager } from '../managers/createTtsManager';

export function useAppShellTtsManager({
  ttsManagerRef,
  audioContextRef,
  currentAudioRef,
  requestSeqRef,
  clientIdRef,
  nowMs,
  backendBase,
  maxPreGenerateCount = 2,
  ttsFetchConcurrency,
  ttsMode,
  modelscopeVoice,
  ttsSpeed,
  emitClientEvent,
  guideEnabledRef,
  tourStateRef,
  tourPipelineRef,
  ttsEnabledRef,
  getTourStopName,
  setTourState,
  setLastQuestion,
  buildTourPrompt,
  setAnswer,
  playTourRecordingEnabledRef,
  selectedTourRecordingIdRef,
  interruptManagerRef,
  debugRef,
  debugMark,
  debugRefresh,
} = {}) {
  const getTtsManager = useCallback(
    () =>
      createOrGetTtsManager({
        ttsManagerRef,
        audioContextRef,
        currentAudioRef,
        runIdRef: requestSeqRef,
        clientIdRef,
        nowMs,
        baseUrl: backendBase,
        useSavedTts: false,
        maxPreGenerateCount,
        fetchConcurrency: ttsFetchConcurrency,
        ttsMode,
        ttsVoice: ttsMode === 'modelscope' || ttsMode === 'flash' ? modelscopeVoice : '',
        ttsSpeed,
        emitClientEvent: (event) => emitClientEvent({ ...(event || {}), clientId: clientIdRef.current }),
        onStopIndexChange: createTtsOnStopIndexChange({
          guideEnabledRef,
          tourStateRef,
          tourPipelineRef,
          ttsEnabledRef,
          getTourStopName,
          setTourState,
          setLastQuestion,
          buildTourPrompt,
          setAnswer,
          enqueueSegment: (segment, meta) => {
            const manager = ttsManagerRef.current;
            if (manager) manager.enqueueText(segment, meta);
          },
          enqueueAudioSegment: (url, meta) => {
            const manager = ttsManagerRef.current;
            if (manager && typeof manager.enqueueAudioUrl === 'function') manager.enqueueAudioUrl(url, meta);
          },
          ensureTtsRunning: () => {
            const manager = ttsManagerRef.current;
            if (manager) manager.ensureRunning();
          },
          getPlaybackRecordingId: () =>
            playTourRecordingEnabledRef && playTourRecordingEnabledRef.current && selectedTourRecordingIdRef
              ? selectedTourRecordingIdRef.current
              : '',
          interruptManagerRef,
        }),
        debugRef,
        debugMark,
        debugRefresh,
        onLog: console.log,
        onWarn: console.warn,
        onError: console.error,
      }),
    [
      audioContextRef,
      backendBase,
      buildTourPrompt,
      clientIdRef,
      currentAudioRef,
      debugMark,
      debugRef,
      debugRefresh,
      emitClientEvent,
      getTourStopName,
      guideEnabledRef,
      interruptManagerRef,
      maxPreGenerateCount,
      modelscopeVoice,
      nowMs,
      playTourRecordingEnabledRef,
      requestSeqRef,
      selectedTourRecordingIdRef,
      setAnswer,
      setLastQuestion,
      setTourState,
      tourPipelineRef,
      tourStateRef,
      ttsEnabledRef,
      ttsFetchConcurrency,
      ttsManagerRef,
      ttsMode,
      ttsSpeed,
    ]
  );

  return { getTtsManager };
}
