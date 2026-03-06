import { useCallback, useState } from 'react';
import { useVoiceInputManager } from './useVoiceInputManager';

const CONVERSATION_START_TIMEOUT_MS = 12000;

function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

function withTimeout(promise, timeoutMs) {
  const ms = Math.max(1000, Number(timeoutMs) || CONVERSATION_START_TIMEOUT_MS);
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      setTimeout(() => resolve({ started: false, timeout: true }), ms);
    }),
  ]);
}

export function useVoiceConversationControls({
  asrProviderType = 'voicekit_ws',
  baseUrl,
  minRecordMs = 900,
  asrStopGraceMs = 480,
  asrFinalWaitMs = 1500,
  asrFinalTimeoutStrategy = 'keep_partial',
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

  const showTransientStatus = useCallback(
    (message, durationMs = 2200) => {
      const m = safeTrim(message);
      if (!m || typeof setQueueStatus !== 'function') return;
      setQueueStatus(m);
      try {
        window.clearTimeout(window.__voiceConversationStatusTimer);
      } catch (_) {
        // ignore
      }
      window.__voiceConversationStatusTimer = window.setTimeout(() => setQueueStatus(''), Math.max(600, Number(durationMs) || 2200));
    },
    [setQueueStatus]
  );

  const wakeWordFeedback = useCallback(
    ({ message } = {}) => {
      showTransientStatus(message, 2000);
    },
    [showTransientStatus]
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

  const {
    isRecording,
    isRecognizing,
    recognitionStage,
    startRecording,
    stopRecording,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
  } =
    useVoiceInputManager({
      providerType: asrProviderType,
      baseUrl,
      minRecordMs,
      asrStopGraceMs,
      asrFinalWaitMs,
      asrFinalTimeoutStrategy,
      clientIdRef,
      setInputText,
      getInputText: () => inputText,
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
      showTransientStatus('已结束语音对话');
      return;
    }

    if (isRecording) return;

    setConversationBusy(true);
    showTransientStatus('正在开启语音对话...', 4000);
    // eslint-disable-next-line no-console
    console.info('[ASR-UI] conversation_start_requested');
    try {
      const result = await withTimeout(startRecording(), CONVERSATION_START_TIMEOUT_MS);
      const started = typeof result === 'object' && result && Object.prototype.hasOwnProperty.call(result, 'started')
        ? !!result.started
        : !!result;
      const timedOut = !!(result && typeof result === 'object' && result.timeout);
      if (!started) {
        setConversationEnabled(false);
        showTransientStatus(
          timedOut ? '语音启动超时，请检查麦克风权限/网络/ASR配置' : '语音未启动，请检查麦克风权限和 ASR 配置',
          3600
        );
        // eslint-disable-next-line no-console
        console.warn('[ASR-UI] conversation_start_failed', { timedOut });
        return;
      }
      setConversationEnabled(true);
      showTransientStatus('语音对话已开启');
    } catch (e) {
      setConversationEnabled(false);
      const errMsg = safeTrim(e && e.message ? e.message : e);
      showTransientStatus(errMsg ? `语音启动失败: ${errMsg}` : '语音启动失败，请检查ASR配置', 3600);
      // eslint-disable-next-line no-console
      console.error('[ASR-UI] conversation_start_exception', e);
    } finally {
      setConversationBusy(false);
    }
  }, [conversationBusy, conversationEnabled, isRecording, showTransientStatus, startRecording, stopRecording]);

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
    isRecognizing,
    recognitionStage,
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
