import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceInputManager } from './useVoiceInputManager';
import {
  CONVERSATION_START_TIMEOUT_MS,
  errorMessage,
  isE2eAsrMockEnabled,
  safeTrim,
  withTimeout,
} from './voiceConversationUtils';

const AUTO_RESUME_RETRY_MS = 500;
const AUTO_SUBMIT_DEDUPE_MS = 1500;
const AUTO_SUBMIT_SILENCE_MIN_MS = 500;
const AUTO_SUBMIT_SILENCE_MAX_MS = 3000;

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
  continueTour,
  autoSubmitSilenceMs = 1200,
  autoResumeAfterQaEnabled = true,
  shouldAutoResumeTour,
  canAutoResumeTour,
  isRunActive,
  isAsrBusyForResume,
  autoResumeTourAfterQaMs = 2200,
} = {}) {
  const [conversationEnabled, setConversationEnabled] = useState(false);
  const [conversationBusy, setConversationBusy] = useState(false);
  const autoQuestionSeqRef = useRef(0);
  const resumeWantedRef = useRef(false);
  const resumeLatestSeqRef = useRef(0);
  const resumeTimerRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);
  const lastAutoSubmitRef = useRef({ text: '', at: 0 });

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

  const clearResumeTimer = useCallback(() => {
    try {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    } catch (_) {
      // ignore
    }
    resumeTimerRef.current = null;
  }, []);

  const clearAutoSubmitTimer = useCallback(() => {
    try {
      if (autoSubmitTimerRef.current) window.clearTimeout(autoSubmitTimerRef.current);
    } catch (_) {
      // ignore
    }
    autoSubmitTimerRef.current = null;
  }, []);

  const runResumeCheck = useCallback(
    async (seq) => {
      const currentSeq = Number(seq) || 0;
      if (!currentSeq) return;
      if (!resumeWantedRef.current) return;
      if (Number(resumeLatestSeqRef.current || 0) !== currentSeq) return;
      if (typeof canAutoResumeTour === 'function' && !canAutoResumeTour()) {
        resumeWantedRef.current = false;
        resumeLatestSeqRef.current = 0;
        clearResumeTimer();
        return;
      }
      const runBusy = typeof isRunActive === 'function' ? !!isRunActive() : false;
      const asrBusy = typeof isAsrBusyForResume === 'function' ? !!isAsrBusyForResume() : false;
      if (runBusy || asrBusy) {
        clearResumeTimer();
        resumeTimerRef.current = window.setTimeout(() => {
          void runResumeCheck(currentSeq);
        }, AUTO_RESUME_RETRY_MS);
        return;
      }
      resumeWantedRef.current = false;
      resumeLatestSeqRef.current = 0;
      clearResumeTimer();
      if (typeof continueTour === 'function') {
        try {
          await continueTour();
          showTransientStatus('继续讲解', 1500);
        } catch (error) {
          const message = errorMessage(error);
          showTransientStatus(message ? `voice conversation resume failed: ${message}` : 'voice conversation resume failed', 3000);
          // eslint-disable-next-line no-console
          console.error('[ASR-UI] voice_conversation_resume_failed', error);
        }
      }
    },
    [canAutoResumeTour, clearResumeTimer, continueTour, isAsrBusyForResume, isRunActive, showTransientStatus]
  );

  const scheduleTourResume = useCallback(
    (seq, delayMs = autoResumeTourAfterQaMs) => {
      const currentSeq = Number(seq) || 0;
      if (!currentSeq) return;
      clearResumeTimer();
      const waitMs = Math.max(250, Number(delayMs) || Number(autoResumeTourAfterQaMs) || 2200);
      resumeTimerRef.current = window.setTimeout(() => {
        void runResumeCheck(currentSeq);
      }, waitMs);
    },
    [autoResumeTourAfterQaMs, clearResumeTimer, runResumeCheck]
  );

  useEffect(() => {
    return () => {
      clearResumeTimer();
    };
  }, [clearResumeTimer]);

  useEffect(() => {
    return () => {
      clearAutoSubmitTimer();
    };
  }, [clearAutoSubmitTimer]);

  useEffect(() => {
    if (autoResumeAfterQaEnabled) return;
    resumeWantedRef.current = false;
    resumeLatestSeqRef.current = 0;
    clearResumeTimer();
  }, [autoResumeAfterQaEnabled, clearResumeTimer]);

  useEffect(() => {
    if (conversationEnabled) return;
    clearAutoSubmitTimer();
  }, [clearAutoSubmitTimer, conversationEnabled]);

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
        skipTourCommand: true,
      });
    },
    [selectedAgentId, speakerName, submitUserText, useAgentMode]
  );

  const handleAsrFinalText = useCallback(
    async (text) => {
      const finalText = safeTrim(text);
      if (typeof onAsrFinalText === 'function') {
        try {
          onAsrFinalText(finalText);
        } catch (_) {
          // ignore
        }
      }
      if (!conversationEnabled) return;
      if (!finalText) return;
      if (typeof submitUserText !== 'function') return;
      if (useAgentMode && !selectedAgentId) {
        showTransientStatus('请先选择智能体后再提问', 1800);
        return;
      }

      const nowMs = Date.now();
      const last = lastAutoSubmitRef.current || { text: '', at: 0 };
      if (last.text === finalText && nowMs - Number(last.at || 0) < AUTO_SUBMIT_DEDUPE_MS) return;
      lastAutoSubmitRef.current = { text: finalText, at: nowMs };

      const seq = Number(autoQuestionSeqRef.current || 0) + 1;
      autoQuestionSeqRef.current = seq;

      const resumeContextLikely =
        !!autoResumeAfterQaEnabled &&
        (
          (typeof shouldAutoResumeTour === 'function' && !!shouldAutoResumeTour()) ||
          (typeof canAutoResumeTour === 'function' && !!canAutoResumeTour()) ||
          !!resumeWantedRef.current
        );
      if (resumeContextLikely) {
        resumeWantedRef.current = true;
        resumeLatestSeqRef.current = seq;
        clearResumeTimer();
      }

      clearAutoSubmitTimer();
      const waitMs = Math.max(
        AUTO_SUBMIT_SILENCE_MIN_MS,
        Math.min(AUTO_SUBMIT_SILENCE_MAX_MS, Number(autoSubmitSilenceMs) || 1200)
      );
      showTransientStatus('识别到问题，准备发送...', Math.max(800, waitMs));
      autoSubmitTimerRef.current = window.setTimeout(async () => {
        autoSubmitTimerRef.current = null;
        showTransientStatus('识别到问题，正在回答...', 1200);
        let result = null;
        try {
          result = await submitUserText({
            text: finalText,
            trigger: 'voice',
            groupMode: false,
            speakerName,
            priority: 'normal',
            useAgentMode,
            selectedAgentId,
            skipTourCommand: true,
          });
        } catch (error) {
          const message = errorMessage(error);
          showTransientStatus(message ? `voice conversation submit failed: ${message}` : 'voice conversation submit failed', 3000);
          // eslint-disable-next-line no-console
          console.error('[ASR-UI] voice_conversation_submit_failed', error);
          if (resumeContextLikely && Number(resumeLatestSeqRef.current || 0) === seq) {
            resumeWantedRef.current = false;
            resumeLatestSeqRef.current = 0;
            clearResumeTimer();
          }
          return;
        }

        const isLatest = Number(resumeLatestSeqRef.current || 0) === seq;
        const asked = !!(result && result.ok && result.kind === 'asked');
        if (!asked) {
          if (resumeContextLikely && isLatest) {
            resumeWantedRef.current = false;
            resumeLatestSeqRef.current = 0;
            clearResumeTimer();
          }
          return;
        }
        if (autoResumeAfterQaEnabled && resumeWantedRef.current && isLatest) scheduleTourResume(seq);
      }, waitMs);
    },
    [
      autoSubmitSilenceMs,
      autoResumeAfterQaEnabled,
      clearAutoSubmitTimer,
      clearResumeTimer,
      conversationEnabled,
      onAsrFinalText,
      scheduleTourResume,
      canAutoResumeTour,
      selectedAgentId,
      shouldAutoResumeTour,
      showTransientStatus,
      speakerName,
      submitUserText,
      useAgentMode,
    ]
  );

  useEffect(() => {
    if (!isE2eAsrMockEnabled()) return () => {};
    const bridge = window.__RAGINT_E2E__;

    // Test-only bridge for deterministic E2E voice flow.
    const prevEmitAsrFinal = bridge.emitAsrFinal;
    const prevSetConversationEnabled = bridge.setConversationEnabled;
    const prevGetConversationState = bridge.getConversationState;

    const emitAsrFinal = (text) => {
      // Test bridge should not block on async ask/tts completion.
      void handleAsrFinalText(text);
      return true;
    };
    const setConversationEnabledForTest = (value) => {
      const next = !!value;
      setConversationEnabled(next);
      return next;
    };
    const getConversationState = () => ({
      enabled: !!conversationEnabled,
      busy: !!conversationBusy,
    });

    bridge.emitAsrFinal = emitAsrFinal;
    bridge.setConversationEnabled = setConversationEnabledForTest;
    bridge.getConversationState = getConversationState;

    return () => {
      if (bridge.emitAsrFinal === emitAsrFinal) {
        if (typeof prevEmitAsrFinal === 'function') bridge.emitAsrFinal = prevEmitAsrFinal;
        else delete bridge.emitAsrFinal;
      }
      if (bridge.setConversationEnabled === setConversationEnabledForTest) {
        if (typeof prevSetConversationEnabled === 'function') bridge.setConversationEnabled = prevSetConversationEnabled;
        else delete bridge.setConversationEnabled;
      }
      if (bridge.getConversationState === getConversationState) {
        if (typeof prevGetConversationState === 'function') bridge.getConversationState = prevGetConversationState;
        else delete bridge.getConversationState;
      }
    };
  }, [conversationBusy, conversationEnabled, handleAsrFinalText]);

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
      onAsrFinalText: handleAsrFinalText,
      askQuestion,
      submitText: wakeWordSubmitText,
    });

  const onToggleConversation = useCallback(async () => {
    if (conversationBusy) return;
    const e2eAsrMockEnabled = isE2eAsrMockEnabled();

    if (conversationEnabled) {
      setConversationEnabled(false);
      clearAutoSubmitTimer();
      if (!e2eAsrMockEnabled) stopRecording();
      showTransientStatus('已结束语音对话');
      return;
    }

    if (isRecording) return;

    setConversationBusy(true);
    showTransientStatus('正在开启语音对话...', 4000);
    // eslint-disable-next-line no-console
    console.info('[ASR-UI] conversation_start_requested');
    try {
      if (e2eAsrMockEnabled) {
        // E2E ASR mock bypasses real microphone startup so Playwright can
        // validate the real button click path deterministically.
        setConversationEnabled(true);
        showTransientStatus('语音对话已开启');
        return;
      }
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
  }, [clearAutoSubmitTimer, conversationBusy, conversationEnabled, isRecording, showTransientStatus, startRecording, stopRecording]);

  const handleTextSubmit = useCallback(
    async (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      const text = String(inputText || '').trim();
      if (text && (!useAgentMode || !!selectedAgentId)) {
        if (typeof submitUserText !== 'function') {
          const error = new Error('submitUserText dependency is required');
          showTransientStatus(error.message, 3000);
          // eslint-disable-next-line no-console
          console.error('[TEXT-UI] submit_failed', error);
          return { ok: false, kind: 'submit_failed', error };
        }
        try {
          return await submitUserText({
            text,
            trigger: 'text',
            groupMode,
            speakerName,
            priority: questionPriority,
            useAgentMode,
            selectedAgentId,
          });
        } catch (error) {
          const message = errorMessage(error);
          showTransientStatus(message ? `text submit failed: ${message}` : 'text submit failed', 3000);
          // eslint-disable-next-line no-console
          console.error('[TEXT-UI] submit_failed', error);
          return { ok: false, kind: 'submit_failed', error };
        }
      }
      if (text && useAgentMode && !selectedAgentId) {
        alert('请先选择智能体再提问');
      }
    },
    [groupMode, inputText, questionPriority, selectedAgentId, showTransientStatus, speakerName, submitUserText, useAgentMode]
  );

  const submitTextAuto = useCallback(
    async (text, trigger) => {
      const q = String(text || '').trim();
      if (!q) return;
      if (useAgentMode && !selectedAgentId) {
        alert('请先选择智能体再提问');
        return;
      }
      if (typeof submitUserText !== 'function') {
        const error = new Error('submitUserText dependency is required');
        showTransientStatus(error.message, 3000);
        // eslint-disable-next-line no-console
        console.error('[TEXT-UI] quick_submit_failed', error);
        return { ok: false, kind: 'submit_failed', error };
      }
      try {
        return await submitUserText({
          text: q,
          trigger: trigger || 'quick',
          groupMode: false,
          speakerName,
          priority: 'normal',
          useAgentMode,
          selectedAgentId,
        });
      } catch (error) {
        const message = errorMessage(error);
        showTransientStatus(message ? `text submit failed: ${message}` : 'text submit failed', 3000);
        // eslint-disable-next-line no-console
        console.error('[TEXT-UI] quick_submit_failed', error);
        return { ok: false, kind: 'submit_failed', error };
      }
    },
    [selectedAgentId, showTransientStatus, speakerName, submitUserText, useAgentMode]
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

