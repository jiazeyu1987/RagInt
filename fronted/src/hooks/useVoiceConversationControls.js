import { useCallback, useState } from 'react';
import { useVoiceInputManager } from './useVoiceInputManager';

export function useVoiceConversationControls({
  baseUrl,
  minRecordMs = 900,
  clientIdRef,
  setInputText,
  setIsLoading,
  decodeAndConvertToWav16kMono,
  unlockAudio,
  ttsEnabledRef,
  audioContextRef,
  isLoading,
  wakeWordEnabled,
  wakeWord,
  wakeWordStrict,
  wakeWordCooldownMs,
  askQuestion,
  submitUserText,
  onAsrFinalText,
  setQueueStatus,
  inputText,
  groupMode,
  speakerName,
  questionPriority,
  useAgentMode,
  selectedAgentId,
} = {}) {
  const [conversationEnabled, setConversationEnabled] = useState(false);
  const [conversationBusy, setConversationBusy] = useState(false);

  const wakeWordFeedback = useCallback(
    ({ message } = {}) => {
      const m = String(message || '').trim();
      if (!m) return;
      setQueueStatus(m);
      try {
        window.clearTimeout(window.__wakeWordStatusTimer);
      } catch (_) {
        // ignore
      }
      window.__wakeWordStatusTimer = window.setTimeout(() => setQueueStatus(''), 2000);
    },
    [setQueueStatus]
  );

  const wakeWordSubmitText = useCallback(
    async (q) => {
      if (typeof submitUserText !== 'function') return;
      return submitUserText({
        text: q,
        trigger: 'wake_word',
        groupMode: false,
        speakerName,
        priority: 'normal',
        useAgentMode,
        selectedAgentId,
      });
    },
    [selectedAgentId, speakerName, submitUserText, useAgentMode]
  );

  const { isRecording, startRecording, stopRecording, onRecordPointerDown, onRecordPointerUp, onRecordPointerCancel } =
    useVoiceInputManager({
      baseUrl,
      minRecordMs,
      clientIdRef,
      setInputText,
      setIsLoading,
      decodeAndConvertToWav16kMono,
      unlockAudio,
      ttsEnabledRef,
      audioContextRef,
      isLoading,
      wakeWordEnabled,
      wakeWord,
      wakeWordStrict,
      wakeWordCooldownMs,
      onWakeWordFeedback: wakeWordFeedback,
      onAsrFinalText,
      askQuestion,
      submitText: wakeWordSubmitText,
    });

  const onToggleConversation = useCallback(async () => {
    if (conversationBusy) return;

    if (conversationEnabled) {
      setConversationEnabled(false);
      stopRecording();
      return;
    }

    if (isRecording) return;

    setConversationBusy(true);
    try {
      await startRecording();
      setConversationEnabled(true);
    } finally {
      setConversationBusy(false);
    }
  }, [conversationBusy, conversationEnabled, isRecording, startRecording, stopRecording]);

  const handleTextSubmit = useCallback(
    async (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      const text = String(inputText || '').trim();
      if (text && (!useAgentMode || !!selectedAgentId)) {
        if (typeof submitUserText !== 'function') return;
        await submitUserText({
          text,
          trigger: 'text',
          groupMode,
          speakerName,
          priority: questionPriority,
          useAgentMode,
          selectedAgentId,
        });
        return;
      }
      if (text && useAgentMode && !selectedAgentId) {
        alert('请先选择智能体再提问');
      }
    },
    [groupMode, inputText, questionPriority, selectedAgentId, speakerName, submitUserText, useAgentMode]
  );

  const submitTextAuto = useCallback(
    async (text, trigger) => {
      const q = String(text || '').trim();
      if (!q) return;
      if (useAgentMode && !selectedAgentId) {
        alert('请先选择智能体再提问');
        return;
      }
      if (typeof submitUserText !== 'function') return;
      return submitUserText({
        text: q,
        trigger: trigger || 'quick',
        groupMode: false,
        speakerName,
        priority: 'normal',
        useAgentMode,
        selectedAgentId,
      });
    },
    [selectedAgentId, speakerName, submitUserText, useAgentMode]
  );

  return {
    isRecording,
    startRecording,
    stopRecording,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
    conversationEnabled,
    conversationBusy,
    onToggleConversation,
    handleTextSubmit,
    submitTextAuto,
  };
}
