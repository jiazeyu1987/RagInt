import { useEffect, useRef } from 'react';

const ASR_FILTER_PREFETCH_DELAY_MS = 120;

function isAsrActive({ isRecognizing = false, recognitionStage = '' } = {}) {
  return (
    !!isRecognizing
    || recognitionStage === 'receiving_partial'
    || recognitionStage === 'awaiting_final'
    || recognitionStage === 'final_received'
    || recognitionStage === 'streaming'
    || recognitionStage === 'wake_detected'
  );
}

export function useAsrFilterPrefetch({
  inputText = '',
  pendingAsrFinalTextRef,
  isRecognizing = false,
  recognitionStage = '',
  asrTextFilterEnabled = false,
  asrTextFilterPrompt = '',
  asrTextFilterChatName = '',
  asrTextFilterTerms = '',
  wakeWordEnabled = false,
  wakeWord = '',
  pipelineRef,
} = {}) {
  const prefetchTimerRef = useRef(null);
  const prefetchSeqRef = useRef(0);

  useEffect(() => {
    const text = String(inputText || '').trim();
    const pendingAsrText = String((pendingAsrFinalTextRef && pendingAsrFinalTextRef.current) || '').trim();
    if (!isAsrActive({ isRecognizing, recognitionStage })) return () => {};
    if (!text || !pendingAsrText || text !== pendingAsrText) return () => {};
    if (!asrTextFilterEnabled) return () => {};
    const prompt = String(asrTextFilterPrompt || '').trim();
    const chatName = String(asrTextFilterChatName || '').trim();
    if (!prompt || !chatName) return () => {};
    const pipeline = pipelineRef && pipelineRef.current;
    if (!pipeline || typeof pipeline.prefetchFilter !== 'function') return () => {};

    const seq = Number(prefetchSeqRef.current || 0) + 1;
    prefetchSeqRef.current = seq;
    try {
      if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
    } catch (_) {
      // ignore
    }
    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null;
      if (prefetchSeqRef.current !== seq) return;
      pipeline
        .prefetchFilter({
          text,
          wakeWordEnabled,
          wakeWord,
          asrTextFilterEnabled,
          asrTextFilterPrompt,
          asrTextFilterChatName,
          asrTextFilterTerms,
        })
        .catch(() => {});
    }, ASR_FILTER_PREFETCH_DELAY_MS);

    return () => {
      try {
        if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
      } catch (_) {
        // ignore
      }
      prefetchTimerRef.current = null;
    };
  }, [
    inputText,
    pendingAsrFinalTextRef,
    isRecognizing,
    recognitionStage,
    asrTextFilterEnabled,
    asrTextFilterPrompt,
    asrTextFilterChatName,
    asrTextFilterTerms,
    wakeWordEnabled,
    wakeWord,
    pipelineRef,
  ]);
}
