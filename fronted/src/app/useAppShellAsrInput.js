import { useCallback, useRef, useState } from 'react';
import { AsrPostProcessPipeline } from '../voice/AsrPostProcessPipeline';
import { createInitialAsrProbeState, trimText } from './appShellState';

const ASR_PROCESSING_STATUS_TEXT = '正在过滤和纠错 ASR 文本...';

export function useAppShellAsrInput({
  filterAsrText,
  wakeHoldMs = 0,
  createPipeline,
  setQueueStatus,
  showTransientQueueStatus,
  wakeWordEnabled = false,
  wakeWord = '',
  wakeWordStrict = false,
  asrTextFilterEnabled = false,
  asrTextFilterPrompt = '',
  asrTextFilterChatName = '',
  asrTextFilterTerms = '',
} = {}) {
  const [inputText, setInputTextState] = useState('');
  const [asrPostProcessStage, setAsrPostProcessStage] = useState('idle');
  const [asrPostProcessEvents, setAsrPostProcessEvents] = useState([]);
  const pendingAsrFinalTextRef = useRef('');
  const lastAsrInputChangeAtRef = useRef(0);
  const pendingAsrClientEventsRef = useRef([]);
  const asrE2eProbeRef = useRef(createInitialAsrProbeState());
  const asrPostProcessPipelineRef = useRef(null);
  if (!asrPostProcessPipelineRef.current) {
    asrPostProcessPipelineRef.current =
      typeof createPipeline === 'function'
        ? createPipeline()
        : new AsrPostProcessPipeline({
            filterAsrText,
            now: () => Date.now(),
            wakeHoldMs,
          });
  }

  const setInputText = useCallback((next) => {
    pendingAsrFinalTextRef.current = '';
    if (asrPostProcessPipelineRef.current) asrPostProcessPipelineRef.current.clearPendingAsrText();
    pendingAsrClientEventsRef.current = [];
    asrE2eProbeRef.current.lastPostProcessResult = null;
    setAsrPostProcessStage('idle');
    setAsrPostProcessEvents([]);
    setInputTextState(next);
    asrE2eProbeRef.current.inputText = String(next || '');
    asrE2eProbeRef.current.lastUpdatedAtMs = Date.now();
  }, []);

  const setInputTextFromAsr = useCallback((next) => {
    const nowMs = Date.now();
    lastAsrInputChangeAtRef.current = nowMs;
    setInputTextState(next);
    asrE2eProbeRef.current.lastInputTextFromAsr = String(next || '');
    asrE2eProbeRef.current.lastInputTextFromAsrAtMs = nowMs;
    asrE2eProbeRef.current.inputText = String(next || '');
    asrE2eProbeRef.current.lastUpdatedAtMs = nowMs;
  }, []);

  const handleAsrFinalText = useCallback((text) => {
    const finalText = trimText(text);
    const nowMs = Date.now();
    pendingAsrFinalTextRef.current = finalText;
    if (asrPostProcessPipelineRef.current) asrPostProcessPipelineRef.current.setPendingAsrText(finalText);
    asrE2eProbeRef.current.lastFinalTextBeforePostProcess = finalText;
    asrE2eProbeRef.current.lastFinalReceivedAtMs = nowMs;
    asrE2eProbeRef.current.lastUpdatedAtMs = nowMs;
  }, []);

  const consumePendingAsrClientEvents = useCallback(() => {
    const items = Array.isArray(pendingAsrClientEventsRef.current) ? [...pendingAsrClientEventsRef.current].reverse() : [];
    pendingAsrClientEventsRef.current = [];
    return items;
  }, []);

  const syncAsrProbeState = useCallback(
    ({ queueStatus = '', isRecording = false, isRecognizing = false, recognitionStage = '' } = {}) => {
      asrE2eProbeRef.current.inputText = String(inputText || '');
      asrE2eProbeRef.current.queueStatus = String(queueStatus || '');
      asrE2eProbeRef.current.isRecording = !!isRecording;
      asrE2eProbeRef.current.isRecognizing = !!isRecognizing;
      asrE2eProbeRef.current.recognitionStage = String(recognitionStage || 'idle');
      asrE2eProbeRef.current.asrPostProcessStage = String(asrPostProcessStage || 'idle');
      asrE2eProbeRef.current.asrPostProcessEvents = Array.isArray(asrPostProcessEvents) ? asrPostProcessEvents : [];
    },
    [asrPostProcessEvents, asrPostProcessStage, inputText]
  );

  const preprocessVoiceText = useCallback(
    async ({ text, trigger } = {}) => {
      const originalText = trimText(text);
      pendingAsrFinalTextRef.current = '';
      const pipeline = asrPostProcessPipelineRef.current;
      if (!pipeline) return originalText;
      setAsrPostProcessStage('pending_asr_matched');

      const result = await pipeline.process({
        text: originalText,
        trigger,
        wakeWordEnabled,
        wakeWord,
        wakeWordStrict,
        asrTextFilterEnabled,
        asrTextFilterPrompt,
        asrTextFilterChatName,
        asrTextFilterTerms,
        onStatusChange: (status) => {
          if (status === 'processing_asr_text') setQueueStatus(ASR_PROCESSING_STATUS_TEXT);
          else setQueueStatus('');
        },
        onStageChange: (stage) => setAsrPostProcessStage(String(stage || 'idle')),
        onEvent: (event) => {
          pendingAsrClientEventsRef.current = [
            event,
            ...(Array.isArray(pendingAsrClientEventsRef.current) ? pendingAsrClientEventsRef.current : []),
          ].slice(0, 12);
          setAsrPostProcessEvents((prev) => {
            const next = [event, ...(Array.isArray(prev) ? prev : [])];
            return next.slice(0, 8);
          });
        },
      });

      asrE2eProbeRef.current.lastPostProcessResult = {
        originalText,
        trigger: String(trigger || ''),
        accepted: !!(result && result.accepted),
        text: String((result && result.text) || ''),
        correctedText: String((result && result.correctedText) || ''),
        reason: String((result && result.reason) || ''),
        feedback: String((result && result.feedback) || ''),
        stage: String((result && result.stage) || ''),
        processedAtMs: Date.now(),
      };
      asrE2eProbeRef.current.lastUpdatedAtMs = Date.now();
      if (!result.accepted) {
        setInputTextState('');
        asrE2eProbeRef.current.inputText = '';
        if (result.feedback === 'wake_word_detected') showTransientQueueStatus('已检测到唤醒词');
        else if (result.feedback === 'wake_word_missing') showTransientQueueStatus('未检测到唤醒词');
        return '';
      }

      setInputTextState(result.text);
      asrE2eProbeRef.current.inputText = String((result && result.text) || '');
      return result.text;
    },
    [
      asrTextFilterChatName,
      asrTextFilterEnabled,
      asrTextFilterPrompt,
      asrTextFilterTerms,
      setQueueStatus,
      showTransientQueueStatus,
      wakeWord,
      wakeWordEnabled,
      wakeWordStrict,
    ]
  );

  return {
    inputText,
    setInputText,
    setInputTextFromAsr,
    handleAsrFinalText,
    preprocessVoiceText,
    asrPostProcessStage,
    asrPostProcessEvents,
    pendingAsrFinalTextRef,
    lastAsrInputChangeAtRef,
    asrE2eProbeRef,
    asrPostProcessPipelineRef,
    consumePendingAsrClientEvents,
    syncAsrProbeState,
  };
}
