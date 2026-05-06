import { useCallback } from 'react';
import { reduceTourButtonState } from './appShellState';

export function useAppShellReset({
  onInterruptManual,
  resetTour,
  queueRef,
  voiceConversationTurnsRef,
  activeAskRequestIdRef,
  askAbortRef,
  ttsManagerRef,
  currentAudioRef,
  setActiveRagflowConversationName,
  setTourButtonState,
  resetTourButtonPlaybackActivity,
  setInputText,
  setLastQuestion,
  setAnswer,
  setAnswerCacheMeta,
  setQaCacheDebug,
  setQueueStatus,
  setQuestionQueue,
  setCurrentIntent,
  setIsLoading,
  setTourSelectedStopIndex,
} = {}) {
  const onResetAll = useCallback(async () => {
    onInterruptManual();
    await resetTour();
    if (queueRef) queueRef.current = [];
    if (voiceConversationTurnsRef) voiceConversationTurnsRef.current = [];
    if (activeAskRequestIdRef) activeAskRequestIdRef.current = null;
    if (askAbortRef) askAbortRef.current = null;
    setActiveRagflowConversationName('');
    if (ttsManagerRef && ttsManagerRef.current) ttsManagerRef.current.stop('reset_all');
    if (currentAudioRef) currentAudioRef.current = null;
    setTourButtonState((state) => reduceTourButtonState(state, { type: 'RESET' }));
    resetTourButtonPlaybackActivity();
    setInputText('');
    setLastQuestion('');
    setAnswer('');
    setAnswerCacheMeta({ hit: false, type: '' });
    setQaCacheDebug(null);
    setQueueStatus('');
    setQuestionQueue([]);
    setCurrentIntent(null);
    setIsLoading(false);
    setTourSelectedStopIndex(0);
  }, [
    onInterruptManual,
    resetTour,
    queueRef,
    voiceConversationTurnsRef,
    activeAskRequestIdRef,
    askAbortRef,
    ttsManagerRef,
    currentAudioRef,
    setActiveRagflowConversationName,
    setTourButtonState,
    resetTourButtonPlaybackActivity,
    setInputText,
    setLastQuestion,
    setAnswer,
    setAnswerCacheMeta,
    setQaCacheDebug,
    setQueueStatus,
    setQuestionQueue,
    setCurrentIntent,
    setIsLoading,
    setTourSelectedStopIndex,
  ]);

  return { onResetAll };
}
