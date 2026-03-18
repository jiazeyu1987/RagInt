import React, { useCallback, useEffect, useState, useRef } from 'react';
import '../App.css';
import {
  decodeAndConvertToWav16kMono as decodeAndConvertToWav16kMonoExt,
  unlockAudio as unlockAudioExt,
} from '../audio/ttsAudio';
import {
  cancelRequest as cancelBackendRequestExt,
  emitClientEvent as emitClientEventExt,
  fetchJson,
  filterAsrText as filterAsrTextExt,
} from '../api/backendClient';
import { InterruptManager } from '../managers/InterruptManager';
import { createTtsOnStopIndexChange } from '../managers/createTtsOnStopIndexChange';
import { createOrGetTtsManager } from '../managers/createTtsManager';
import { InputSection } from '../components/InputSection';
import { SettingsPanel } from '../components/SettingsPanel';
import { MainLayout } from '../components/MainLayout';
import { HomeStatusBar } from '../components/HomeStatusBar';
import { RightPanelTabs } from '../components/RightPanelTabs';
import { SimpleTourControlPage } from '../components/SimpleTourControlPage';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { useBackendEvents } from '../hooks/useBackendEvents';
import { useAppSettings } from '../hooks/useAppSettings';
import { useClientId } from '../hooks/useClientId';
import { useTourBootstrap } from '../hooks/useTourBootstrap';
import { useRagflowBootstrap } from '../hooks/useRagflowBootstrap';
import { useTourState } from '../hooks/useTourState';
import { useBreakpointSync } from '../hooks/useBreakpointSync';
import { useTourPipelineManager } from '../hooks/useTourPipelineManager';
import { useAskWorkflowManager } from '../hooks/useAskWorkflowManager';
import { useHistoryPanel } from '../hooks/useHistoryPanel';
import { useDebugRun } from '../hooks/useDebugRun';
import { useQueueStatusMonitor } from '../hooks/useQueueStatusMonitor';
import { useVoiceConversationControls } from '../hooks/useVoiceConversationControls';
import { useRunOrchestration } from '../hooks/useRunOrchestration';
import { useStagePanelProps } from '../hooks/useStagePanelProps';
import { useControlBarProps } from '../hooks/useControlBarProps';
import { useTourModePanelProps } from '../hooks/useTourModePanelProps';
import { useTextInputProps } from '../hooks/useTextInputProps';
import { useTtsUiSync } from '../hooks/useTtsUiSync';
import { useStateRefsSync } from '../hooks/useStateRefsSync';
import { useUiActions } from '../hooks/useUiActions';
import { useTourRecordingOptions } from '../hooks/useTourRecordingOptions';
import { useTourRecordings } from '../hooks/useTourRecordings';
import { getBackendBase } from '../config/backend';
import { WAKE_HOLD_MS } from '../config/features';
import { parseTourCommand } from '../api/tourCommand';
import { AsrPostProcessPipeline } from '../voice/AsrPostProcessPipeline';

const TOUR_BTN_MODE = {
  START: 'start',
  INTERRUPT: 'interrupt',
  CONTINUE: 'continue',
};
const UI_VIEW_MODE_STORAGE_KEY = 'ragint_ui_view_mode_v1';
const TOUR_RAGFLOW_CHAT_NAME = '\u5c55\u5385\u804a\u5929';

function normalizeUiViewMode(value) {
  const mode = String(value || '').trim();
  return mode === 'simple' ? 'simple' : 'full';
}

function readInitialUiViewMode() {
  if (typeof window === 'undefined' || !window.localStorage) return 'full';
  try {
    return normalizeUiViewMode(window.localStorage.getItem(UI_VIEW_MODE_STORAGE_KEY));
  } catch (_) {
    return 'full';
  }
}

function reduceTourButtonState(state, event) {
  const type = String((event && event.type) || '').trim();
  if (type === 'RESET') return { started: false, mode: TOUR_BTN_MODE.START };
  if (type === 'START_CLICK') return { started: true, mode: TOUR_BTN_MODE.INTERRUPT };
  if (type === 'INTERRUPT_CLICK') return state.started ? { ...state, mode: TOUR_BTN_MODE.CONTINUE } : state;
  if (type === 'CONTINUE_CLICK') return state.started ? { ...state, mode: TOUR_BTN_MODE.INTERRUPT } : state;
  if (type === 'PLAYBACK_STARTED') return state.started ? { ...state, mode: TOUR_BTN_MODE.INTERRUPT } : state;
  if (type === 'PLAYBACK_STOPPED') return state.started ? { ...state, mode: TOUR_BTN_MODE.CONTINUE } : state;
  return state;
}

function AppShell() {
  const backendBase = getBackendBase();
  const [inputText, setInputTextState] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerCacheMeta, setAnswerCacheMeta] = useState({ hit: false, type: '' });
  const [qaCacheDebug, setQaCacheDebug] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
  const [ragflowConnection, setRagflowConnection] = useState({ connected: null, message: '' });
  const [asrPostProcessStage, setAsrPostProcessStage] = useState('idle');
  const [asrPostProcessEvents, setAsrPostProcessEvents] = useState([]);
  const [tourButtonState, setTourButtonState] = useState({ started: false, mode: TOUR_BTN_MODE.START });
  const [uiViewMode, setUiViewMode] = useState(readInitialUiViewMode);
  const [simpleTtsPlaying, setSimpleTtsPlaying] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const clientId = useClientId();
  const {
    ttsMode,
    setTtsMode,
    modelscopeVoice,
    setModelscopeVoice,
    ttsSpeed,
    setTtsSpeed,
    ttsFetchConcurrency,
    setTtsFetchConcurrency,
    guideEnabled,
    setGuideEnabled,
    continuousTour,
    setContinuousTour,
    tourRecordingEnabled,
    setTourRecordingEnabled,
    playTourRecordingEnabled,
    setPlayTourRecordingEnabled,
    selectedTourRecordingId,
    setSelectedTourRecordingId,
    guideDuration,
    setGuideDuration,
    guideStyle,
    setGuideStyle,
    qaAnswerTargetChars,
    setQaAnswerTargetChars,
    qaAudioCacheLookupEnabled,
    setQaAudioCacheLookupEnabled,
    qaAudioCacheConfidenceThreshold,
    setQaAudioCacheConfidenceThreshold,
    showHistoryPanel,
    setShowHistoryPanel,
    showDebugPanel,
    setShowDebugPanel,
    tourZone,
    setTourZone,
    audienceProfile,
    setAudienceProfile,
    groupMode,
    setGroupMode,
    speakerName,
    setSpeakerName,
    tourSelectedStopIndex,
    setTourSelectedStopIndex,
    tourTemplateId,
    tourStopsOverride,
    setTourStopsOverride,
    tourStopDurationsOverride,
    setTourStopDurationsOverride,
    tourStopPromptOverrides,
    setTourStopPromptOverrides,
    tourGuideTemplates,
    setTourGuideTemplates,
    tourGuideTemplateId,
    setTourGuideTemplateId,
    tourStopDurationTemplateKey,
    setTourStopDurationTemplateKey,
    tourStopDurationTemplates,
    setTourStopDurationTemplates,
    wakeWordEnabled,
    setWakeWordEnabled,
    wakeWord,
    setWakeWord,
    wakeWordCooldownMs,
    setWakeWordCooldownMs,
    wakeWordStrict,
    setWakeWordStrict,
    asrAutoSubmitOnWakeEnabled,
    setAsrAutoSubmitOnWakeEnabled,
    asrAutoResumeAfterAnswerEnabled,
    setAsrAutoResumeAfterAnswerEnabled,
    asrAutoResumeAfterAnswerDelayMs,
    setAsrAutoResumeAfterAnswerDelayMs,
    asrConversationAutoSubmitSilenceMs,
    setAsrConversationAutoSubmitSilenceMs,
    asrConversationAutoSubmitScope,
    setAsrConversationAutoSubmitScope,
    asrConversationContextStrategy,
    setAsrConversationContextStrategy,
    asrConversationContextRecentTurns,
    setAsrConversationContextRecentTurns,
    asrConversationContextMaxTokens,
    setAsrConversationContextMaxTokens,
    globalPromptPrefix,
    setGlobalPromptPrefix,
    asrTextFilterEnabled,
    setAsrTextFilterEnabled,
    asrTextFilterChatName,
    setAsrTextFilterChatName,
    asrTextFilterTerms,
    setAsrTextFilterTerms,
    asrTextFilterPrompt,
    setAsrTextFilterPrompt,
    settingsActiveTab,
    setSettingsActiveTab,
    asrMinRecordMs,
    setAsrMinRecordMs,
    asrStopGraceMs,
    setAsrStopGraceMs,
    asrFinalWaitMs,
    setAsrFinalWaitMs,
    asrProviderType,
    setAsrProviderType,
    asrFinalTimeoutStrategy,
    setAsrFinalTimeoutStrategy,
    saucWsUrl,
    setSaucWsUrl,
    saucResourceId,
    setSaucResourceId,
    saucAppKey,
    setSaucAppKey,
    saucAccessKey,
    setSaucAccessKey,
    saucModelName,
    setSaucModelName,
    saucSegmentDurationMs,
    setSaucSegmentDurationMs,
    saucEnableItn,
    setSaucEnableItn,
    saucEnablePunc,
    setSaucEnablePunc,
    saucEnableDdc,
    setSaucEnableDdc,
    saucShowUtterances,
    setSaucShowUtterances,
    saucEnableNonstream,
    setSaucEnableNonstream,
  } = useAppSettings(clientId);
  const [chatOptions, setChatOptions] = useState([]);
  const [selectedChat, setSelectedChat] = useState('\u5c55\u5385\u804a\u5929');
  const [activeRagflowConversationName, setActiveRagflowConversationName] = useState('');
  const [agentOptions, setAgentOptions] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [useAgentMode, setUseAgentMode] = useState(false);
  const {
    options: tourRecordingOptions,
    refresh: refreshTourRecordingOptions,
    ready: tourRecordingOptionsReady,
  } = useTourRecordingOptions({
    enabled: true,
    limit: 50,
    currentPlaybackSpeed: ttsSpeed,
  });
  const { historySort, setHistorySort, historyItems, fetchHistory } = useHistoryPanel({ enabled: showHistoryPanel });
  const { debugInfo, debugRef, beginDebugRun, debugMark, debugRefresh } = useDebugRun();
  const [tourStops, setTourStops] = useState([]);
  const [tourStopDurations, setTourStopDurations] = useState([]); // aligned with tourStops
  const [tourStopTargetChars, setTourStopTargetChars] = useState([]); // aligned with tourStops
  const [tourState, setTourState] = useTourState();
  const [tourMeta, setTourMeta] = useState({
    zones: ['\u9ed8\u8ba4\u8def\u7ebf'],
    profiles: ['\u5927\u4f17', '\u513f\u7ae5', '\u4e13\u4e1a'],
    default_zone: '\u9ed8\u8ba4\u8def\u7ebf',
    default_profile: '\u5927\u4f17',
  });
  const [questionPriority, setQuestionPriority] = useState('normal'); // 'normal' | 'high'
  const [questionQueue, setQuestionQueue] = useState([]);
  const [stageSpeedMode, setStageSpeedMode] = useState('normal'); // 'normal' | 'fast'
  const debugPollingEnabled = !!showDebugPanel && !!isLoading;
  const debugPollingRequestId = debugPollingEnabled && debugInfo && debugInfo.requestId ? debugInfo.requestId : '';
  const { status: serverStatus, error: serverStatusErr } = useBackendStatus(debugPollingRequestId, {
    enabled: debugPollingEnabled,
  });
  const { items: serverEvents, lastError: serverLastError, error: serverEventsErr } = useBackendEvents(
    debugPollingRequestId,
    {
      enabled: debugPollingEnabled,
    }
  );
  const [currentIntent, setCurrentIntent] = useState(null);
  const markRagflowAvailable = useCallback((info) => {
    const payload = info && typeof info === 'object' ? info : {};
    const source = String((payload && (payload.source || payload.scope)) || '').trim();
    // During bootstrap, only successful chat bootstrap marks RAGFlow as connected.
    if (source.startsWith('bootstrap_') && source !== 'bootstrap_chats') return;
    setRagflowConnection((prev) => (prev && prev.connected === true ? prev : { connected: true, message: '' }));
  }, []);
  const markRagflowUnavailable = useCallback(
    (info) => {
      const payload = info && typeof info === 'object' ? info : { error: info };
      const source = String((payload && (payload.source || payload.scope)) || '').trim();
      const rawErr = payload && Object.prototype.hasOwnProperty.call(payload, 'error') ? payload.error : info;
      const detail = String((rawErr && rawErr.message) || rawErr || '').trim();
      const message = source.startsWith('bootstrap')
        ? 'RAGFlow \u672a\u8fde\u63a5\uff0c\u521d\u59cb\u5316\u914d\u7f6e\u52a0\u8f7d\u5931\u8d25\u3002'
        : 'RAGFlow \u672a\u8fde\u63a5\uff0c\u5df2\u505c\u6b62\u5f53\u524d\u64cd\u4f5c\u3002';
      setRagflowConnection({ connected: false, message: detail ? `${message} ${detail}` : message });
      setQueueStatus(message);
    },
    [setQueueStatus]
  );

  useTourBootstrap({
    setTourMeta,
    setTourZone,
    setAudienceProfile,
    setTourStops,
    setTourSelectedStopIndex,
  });
  useRagflowBootstrap({
    setChatOptions,
    setSelectedChat,
    setAgentOptions,
    setSelectedAgentId,
    onBootstrapSuccess: (info) =>
      markRagflowAvailable({
        ...(info || {}),
        source: `bootstrap_${String((info && info.scope) || 'unknown')}`,
      }),
    onBootstrapError: (info) => {
      const scope = String((info && info.scope) || '').trim();
      if (scope !== 'chats') return;
      markRagflowUnavailable({
        ...(info || {}),
        source: `bootstrap_${scope || 'unknown'}`,
      });
    },
  });

  useBreakpointSync({
    clientId,
    kind: 'tour',
    enabled: true,
    state: {
      tourState,
      tourSelectedStopIndex,
      tourZone,
      audienceProfile,
      guideEnabled,
      continuousTour,
      guideDuration,
      guideStyle,
      qaAnswerTargetChars,
      qaAudioCacheLookupEnabled,
      qaAudioCacheConfidenceThreshold,
    },
    onRestore: (bp) => {
      try {
        if (bp && typeof bp === 'object') {
          if (bp.tourState && typeof bp.tourState === 'object') setTourState(bp.tourState);
          if (Number.isFinite(bp.tourSelectedStopIndex)) setTourSelectedStopIndex(Number(bp.tourSelectedStopIndex));
          if (typeof bp.tourZone === 'string' && bp.tourZone) setTourZone(bp.tourZone);
          if (typeof bp.audienceProfile === 'string' && bp.audienceProfile) setAudienceProfile(bp.audienceProfile);
          if (typeof bp.guideEnabled === 'boolean') setGuideEnabled(bp.guideEnabled);
          if (typeof bp.continuousTour === 'boolean') setContinuousTour(bp.continuousTour);
          if (typeof bp.guideDuration === 'string' && bp.guideDuration) setGuideDuration(bp.guideDuration);
          if (typeof bp.guideStyle === 'string' && bp.guideStyle) setGuideStyle(bp.guideStyle);
          if (typeof bp.qaAnswerTargetChars === 'string') setQaAnswerTargetChars(bp.qaAnswerTargetChars);
          if (typeof bp.qaAudioCacheLookupEnabled === 'boolean') setQaAudioCacheLookupEnabled(bp.qaAudioCacheLookupEnabled);
          if (typeof bp.qaAudioCacheConfidenceThreshold === 'string') {
            setQaAudioCacheConfidenceThreshold(bp.qaAudioCacheConfidenceThreshold);
          }
        }
      } catch (_) {
        // ignore
      }
    },
  });

  const messagesEndRef = useRef(null);
  const PREFERRED_TTS_SAMPLE_RATE = 16000;
  const ttsEnabledRef = useRef(true);
  const continuousTourRef = useRef(continuousTour);
  const tourRecordingEnabledRef = useRef(tourRecordingEnabled);
  const playTourRecordingEnabledRef = useRef(playTourRecordingEnabled);
  const selectedTourRecordingIdRef = useRef(selectedTourRecordingId);
  const activeTourRecordingIdRef = useRef('');
  const guideEnabledRef = useRef(guideEnabled);
  const tourStopsRef = useRef(tourStops);
  const tourZoneRef = useRef(tourZone);
  const audienceProfileRef = useRef(audienceProfile);
  const guideDurationRef = useRef(guideDuration);
  const guideStyleRef = useRef(guideStyle);
  const qaAnswerTargetCharsRef = useRef(qaAnswerTargetChars);
  const qaAudioCacheLookupEnabledRef = useRef(qaAudioCacheLookupEnabled);
  const qaAudioCacheConfidenceThresholdRef = useRef(qaAudioCacheConfidenceThreshold);
  const tourTemplateIdRef = useRef(tourTemplateId);
  const tourStopsOverrideRef = useRef(tourStopsOverride);
  const tourStopDurationsOverrideRef = useRef(tourStopDurationsOverride);
  const tourStopPromptOverridesRef = useRef(tourStopPromptOverrides);
  const useAgentModeRef = useRef(useAgentMode);
  const selectedChatRef = useRef(selectedChat);
  const selectedAgentIdRef = useRef(selectedAgentId);
  const tourMetaRef = useRef(tourMeta);
  const askAbortRef = useRef(null);
  const tourStateRef = useRef(tourState);
  const tourResumeRef = useRef({});
  const tourStopDurationsRef = useRef(tourStopDurations);
  const tourStopTargetCharsRef = useRef(tourStopTargetChars);
  const clientIdRef = useRef(clientId);
  const activeAskRequestIdRef = useRef(null);
  const groupModeRef = useRef(groupMode);
  const queueRef = useRef([]);
  const lastSpeakerRef = useRef('');
  const globalPromptPrefixRef = useRef(globalPromptPrefix);
  const voiceConversationTurnsRef = useRef([]);
  const asrConversationContextStrategyRef = useRef(asrConversationContextStrategy);
  const asrConversationContextRecentTurnsRef = useRef(asrConversationContextRecentTurns);
  const asrConversationContextMaxTokensRef = useRef(asrConversationContextMaxTokens);
  const pendingAsrFinalTextRef = useRef('');
  const lastAsrInputChangeAtRef = useRef(0);
  const wakeWordHoldUntilRef = useRef(0);
  const pendingAsrClientEventsRef = useRef([]);
  const asrPostProcessPipelineRef = useRef(null);
  const wakeWordStatusTimerRef = useRef(null);
  const asrPrefetchTimerRef = useRef(null);
  const asrPrefetchSeqRef = useRef(0);
  if (!asrPostProcessPipelineRef.current) {
    asrPostProcessPipelineRef.current = new AsrPostProcessPipeline({
      filterAsrText: filterAsrTextExt,
      now: () => Date.now(),
      wakeHoldMs: WAKE_HOLD_MS,
    });
  }

  const interruptEpochRef = useRef(0);
  const interruptManagerRef = useRef(null);
  if (!interruptManagerRef.current) interruptManagerRef.current = new InterruptManager(interruptEpochRef);

  const ttsManagerRef = useRef(null);
  const { tourPipelineRef, getTourPipeline, abortPrefetch } = useTourPipelineManager({
    baseUrl: backendBase,
    clientIdRef,
    tourStopsRef,
    tourStateRef,
    audienceProfileRef,
    guideDurationRef,
    guideStyleRef,
    guideEnabledRef,
    tourStopDurationsRef,
    tourStopTargetCharsRef,
    tourStopPromptOverridesRef,
    continuousTourRef,
    tourRecordingEnabledRef,
    activeTourRecordingIdRef,
    playTourRecordingEnabledRef,
    selectedTourRecordingIdRef,
    interruptManagerRef,
    useAgentModeRef,
    selectedChatRef,
    selectedAgentIdRef,
    maxPrefetchAhead: 1,
    onLog: console.log,
    onWarn: console.warn,
  });

  const requestSeqRef = useRef(0);
  const currentAudioRef = useRef(null);
  const receivedSegmentsRef = useRef(false);
  const audioContextRef = useRef(null);
  const USE_SAVED_TTS = false;
  const inputElRef = useRef(null);
  const tourControllerRef = useRef(null);
  const runCoordinatorRef = useRef(null);

  const POINTER_SUPPORTED = typeof window !== 'undefined' && 'PointerEvent' in window;

  const showTransientQueueStatus = (message, durationMs = 2000) => {
    const text = String(message || '').trim();
    if (!text) return;
    setQueueStatus(text);
    try {
      if (wakeWordStatusTimerRef.current) window.clearTimeout(wakeWordStatusTimerRef.current);
    } catch (_) {
      // ignore
    }
    wakeWordStatusTimerRef.current = window.setTimeout(() => {
      wakeWordStatusTimerRef.current = null;
      setQueueStatus('');
    }, durationMs);
  };

  const setInputText = (next) => {
    pendingAsrFinalTextRef.current = '';
    if (asrPostProcessPipelineRef.current) asrPostProcessPipelineRef.current.clearPendingAsrText();
    pendingAsrClientEventsRef.current = [];
    setAsrPostProcessStage('idle');
    setAsrPostProcessEvents([]);
    setInputTextState(next);
  };

  const setInputTextFromAsr = (next) => {
    lastAsrInputChangeAtRef.current = Date.now();
    setInputTextState(next);
  };

  const handleAsrFinalText = (text) => {
    const finalText = String(text || '').trim();
    pendingAsrFinalTextRef.current = finalText;
    if (asrPostProcessPipelineRef.current) asrPostProcessPipelineRef.current.setPendingAsrText(finalText);
  };

  const preprocessVoiceText = async ({ text, trigger } = {}) => {
    const originalText = String(text || '').trim();
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
        if (status === 'processing_asr_text') setQueueStatus('濮濓絽婀径鍕倞 ASR 閺傚洦婀?..');
        else setQueueStatus('');
      },
      onStageChange: (stage) => setAsrPostProcessStage(String(stage || 'idle')),
      onEvent: (event) => {
        pendingAsrClientEventsRef.current = [event, ...(Array.isArray(pendingAsrClientEventsRef.current) ? pendingAsrClientEventsRef.current : [])].slice(0, 12);
        setAsrPostProcessEvents((prev) => {
          const next = [event, ...(Array.isArray(prev) ? prev : [])];
          return next.slice(0, 8);
        });
      },
    });

    wakeWordHoldUntilRef.current = pipeline.getWakeHoldUntilMs();
    if (!result.accepted) {
      setInputTextState('');
      if (result.feedback === 'wake_word_detected') showTransientQueueStatus('\u5df2\u68c0\u6d4b\u5230\u5524\u9192\u8bcd');
      else if (result.feedback === 'wake_word_missing') showTransientQueueStatus('\u672a\u68c0\u6d4b\u5230\u5524\u9192\u8bcd');
      return '';
    }

    setInputTextState(result.text);
    return result.text;
  };

  const getTtsManager = () =>
    createOrGetTtsManager({
      ttsManagerRef,
      audioContextRef,
      currentAudioRef,
      runIdRef: requestSeqRef,
      clientIdRef,
      nowMs,
      baseUrl: backendBase,
      useSavedTts: USE_SAVED_TTS,
      maxPreGenerateCount: MAX_PRE_GENERATE_COUNT,
      fetchConcurrency: ttsFetchConcurrency,
      ttsMode,
      ttsVoice: ttsMode === 'modelscope' || ttsMode === 'flash' ? modelscopeVoice : '',
      ttsSpeed,
      emitClientEvent: (evt) => emitClientEventExt({ ...(evt || {}), clientId: clientIdRef.current }),
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
        enqueueSegment: (s, meta) => {
          const mgr = ttsManagerRef.current;
          if (mgr) mgr.enqueueText(s, meta);
        },
        enqueueAudioSegment: (u, meta) => {
          const mgr = ttsManagerRef.current;
          if (mgr && typeof mgr.enqueueAudioUrl === 'function') mgr.enqueueAudioUrl(u, meta);
        },
        ensureTtsRunning: () => {
          const mgr = ttsManagerRef.current;
          if (mgr) mgr.ensureRunning();
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
    });

  const cancelBackendRequest = (requestId, reason) => {
    cancelBackendRequestExt({ requestId, clientId: clientIdRef.current, reason });
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e || e.key !== 'Escape') return;
      const hasActiveRun =
        !!askAbortRef.current ||
        isLoading ||
        (ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) ||
        !!currentAudioRef.current;
      if (!hasActiveRun) return;
      try {
        e.preventDefault();
      } catch (_) {
        // ignore
      }
      getRunCoordinator().interruptEscape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLoading]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const decodeAndConvertToWav16kMono = async (blob) => {
    return decodeAndConvertToWav16kMonoExt(blob);
  };

  const unlockAudio = () => {
    unlockAudioExt(audioContextRef, PREFERRED_TTS_SAMPLE_RATE);
  };

  useTtsUiSync({
    ttsEnabled,
    ttsEnabledRef,
    currentAudioRef,
    ttsManagerRef,
    setQueueStatus,
    ttsMode,
    modelscopeVoice,
    ttsSpeed,
    ttsFetchConcurrency,
  });

  useStateRefsSync({
    continuousTour,
    continuousTourRef,
    tourRecordingEnabled,
    tourRecordingEnabledRef,
    playTourRecordingEnabled,
    playTourRecordingEnabledRef,
    selectedTourRecordingId,
    selectedTourRecordingIdRef,
    guideEnabled,
    guideEnabledRef,
    tourState,
    tourStateRef,
    tourStops,
    tourStopsRef,
    tourZone,
    tourZoneRef,
    tourStopDurations,
    tourStopDurationsRef,
    tourStopTargetChars,
    tourStopTargetCharsRef,
    audienceProfile,
    audienceProfileRef,
    tourMeta,
    tourMetaRef,
    guideDuration,
    guideDurationRef,
    guideStyle,
    guideStyleRef,
    qaAnswerTargetChars,
    qaAnswerTargetCharsRef,
    qaAudioCacheLookupEnabled,
    qaAudioCacheLookupEnabledRef,
    qaAudioCacheConfidenceThreshold,
    qaAudioCacheConfidenceThresholdRef,
    tourTemplateId,
    tourTemplateIdRef,
    tourStopsOverride,
    tourStopsOverrideRef,
    tourStopDurationsOverride,
    tourStopDurationsOverrideRef,
    tourStopPromptOverrides,
    tourStopPromptOverridesRef,
    useAgentMode,
    useAgentModeRef,
    selectedChat,
    selectedChatRef,
    selectedAgentId,
    selectedAgentIdRef,
    groupMode,
    groupModeRef,
    questionQueue,
    queueRef,
    globalPromptPrefix,
    globalPromptPrefixRef,
  });

  useEffect(() => {
    globalPromptPrefixRef.current = String(globalPromptPrefix || '');
  }, [globalPromptPrefix]);

  useEffect(() => {
    asrConversationContextStrategyRef.current = String(asrConversationContextStrategy || 'smart_recent_current')
      .trim()
      .toLowerCase();
  }, [asrConversationContextStrategy]);

  useEffect(() => {
    const n = Number(asrConversationContextRecentTurns);
    asrConversationContextRecentTurnsRef.current = Number.isFinite(n) ? n : 10;
  }, [asrConversationContextRecentTurns]);

  useEffect(() => {
    const n = Number(asrConversationContextMaxTokens);
    asrConversationContextMaxTokensRef.current = Number.isFinite(n) ? n : 16000;
  }, [asrConversationContextMaxTokens]);

  const getTourStopName = (index) => {
    const stops = Array.isArray(tourStops) ? tourStops : [];
    if (!stops.length) return '';
    const i = Math.max(0, Math.min(Number(index) || 0, stops.length - 1));
    return String(stops[i] || '').trim();
  };

  const buildTourPrompt = (action, stopIndex, tailOverride) => {
    return getTourPipeline().buildTourPrompt(action, stopIndex, tailOverride);
  };

  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // TTS婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柛娑橈攻閸欏繘鏌ｉ幋锝嗩棄闁哄绶氶弻娑樷槈濮楀牊鏁鹃梺鍛婄懃缁绘﹢寮婚敐澶婄闁挎繂妫Λ鍕⒑閸濆嫷鍎庣紒鑸靛哺瀵鈽夊Ο閿嬵潔濠殿喗顨呴悧濠囧极妤ｅ啯鈷戦柛娑橈功閹冲啰绱掔紒姗堣€跨€殿喖顭烽弫鎰緞婵犲嫷鍚呮繝鐢靛Т閻忔岸宕濋弽顐ょ婵°倕鎳忛埛鎴︽⒑椤愩倕浠滈柤娲诲灡閺呭爼顢氶埀顒勫蓟濞戞瑧绡€闁稿本绋戞禒鏉懳旈悩闈涗沪闁告梹鐗滈幑銏犫攽鐎ｎ亞顦ㄥ銈呯箰濡顨ラ崟顖涒拻濞达絿顭堥弳閬嶆煙绾板崬浜版い銏＄墵瀹曞爼鍩￠崘顏嗗帬婵＄偑鍊栧Λ鍐极椤曗偓瀹曟垿骞橀懜闈涙瀭闂佸憡娲﹂崜娑㈡晬濮椻偓濮婃椽宕ㄦ繝鍐ｆ嫻闂佹悶鍔庨弫濠氥€佸鑸垫櫜濠㈣泛锕崬鍫曟⒑閸濆嫭宸濋柛瀣枛椤㈡ê煤椤忓應鎷虹紓鍌欑劍椤洭骞婇崘顔界厵闁惧浚鍋勬慨宥夋煟濞戝崬娅嶅┑顔瑰亾闂侀潧鐗嗗Λ宀勫箯婵犳碍鈷戠紒瀣濠€浼存煟閻旀繂娉氶崶顒佹櫇闁稿本绋撻崢闈涒攽閻愬瓨缍戞い鎴濇噺閺呭爼鎳犻鍌滐紲濠德板€曢崯顐﹀几鎼淬劍鎳氶柡宥庡幗閻撴洘绻涢幋婵嗚埞妤犵偞锕㈤弻锝夊箻閺夋垹浼岄梺鍝勭灱閸犳牕鐣峰Δ鍛殐闁冲搫鍊归鍐⒒娴ｅ憡鍟為柡灞诲妿缁棃鎮烽幍顔芥闂佺鎻粻鎴犵矆鐎ｎ偁浜滈柡宥冨妿閵嗘帡鏌涘鈧禍璺侯潖濞差亜妫橀柕澶涢檮閻濇棃姊洪崨濠忚€跨紒鐘崇墵楠炲﹪寮介鐐靛幐闂佺鏈懝鍓ц姳閵夆晜鈷掑ù锝堟閵嗗﹪鏌涢幘瀵哥畾鐟滄壆濮电换娑氣偓娑欘焽閻绱掗鑺ュ磳鐎殿喖顭烽崹楣冨箛娴ｅ憡鍊梻浣告啞閸旀垿宕濆畝鍕ㄢ偓鏍ㄥ緞閹邦厸鎷哄┑顔炬嚀濞层倖淇婃禒瀣厱闁靛鍎抽崺锝嗩殽閻愯尙澧﹀┑鈩冩倐閸╋繝宕掑☉娆戝礁闂傚倷鐒﹂幃鍫曞磿濠婂牆纾兼繛鎴ｉ哺缂嶆姊婚崒姘偓椋庣矆娓氣偓楠炴牠顢曢敃鈧€氬銇勯幒鎴濃偓濠氭儗濞嗘挻鐓欓柟瑙勫姦閸ゆ瑩鏌ｉ幒鎴犱粵闁靛洤瀚伴獮鎺楀箣椤栨艾顫犵紓鍌欑椤﹂亶寮繝姘摕婵炴垶鍩冮崑鎾绘晲鎼存繄鍑归梺闈╃秬濡嫰婀佸┑鐘诧工鐎氼參宕愰幇顓滀簻闁靛繆妲勯懓鍧楁煙椤斿搫鐏紒杈ㄧ懇閹晠鎮介崹顐ｆ珤濠电姷顣槐鏇㈠磻閹达箑纾归柡宥庡幖缁€澶屾喐韫囨搩鍤楀┑鐘插瀹曞鏌曟繛褍鍊婚悷婵嬫⒒娴ｈ櫣甯涢柛鏃€顨婂畷鏇㈠Χ婢跺浜楀┑鐐叉閸旀垶绂嶅鍫熺厸闁告劑鍔岄埀顒€缍婂畷鐢稿焵椤掍胶绡€闁冲皝鍋撻柛鏇ㄥ幖瀵劑姊洪崫鍕伇闁哥姵鐗犻妴浣糕槈濡攱顫嶅┑鐐叉钃辨い銉ョ墕閳规垿鎮╅幇浣告櫛闂佸摜濮电敮鈥崇暦閹达箑绠荤紓浣骨氶幏娲⒒閸屾氨澧涚紒瀣尵缁宕樺ù瀣杸濡炪倖娲嶉崑鎾淬亜閵夛附灏甸柛鎺撳浮瀵噣宕奸悢铚傜紦闂備礁鎲＄粙鎴ｅ闂佸綊顥撶划顖滄崲濞戞瑦缍囬柛鎾楀嫬浠归梻浣哄劦閸撴繂螞閸愩劎鏆﹂梻鍫熺▓閺嬪酣鏌熼悙顒佺稇闁逞屽墮閻忔氨鎹㈠☉銏犵闁绘劘灏欓悷鎻掆攽閻愬弶鍣归柨鏇樺劦婵＄敻宕熼姘兼綂闂佹寧绋戠€氼參宕虫导瀛樺€垫繛鍫濈仢閺嬫瑧绱掗鐣屾噰闁靛棔绀侀～婊堝焵椤掑嫬绠栨繛鍡樻尰閸婄粯鎱ㄥΔ鈧悧蹇涙嚋鐟欏嫮绡€缁炬澘顦辩壕鍧楁煕鐎ｎ偄鐏寸€规洘鍔欏浠嬧€栭垾铏儓妞ゆ挸鍚嬪鍕節閸曞墎骞㈤梻鍌欐祰椤宕曢幎鑺ュ€堕柛顐犲劚绾惧鏌熼幑鎰厫闁哥姴妫濋弻娑㈠即閵娿儱顫銈忚礋閸旀垵顫忓ú顏勭闁绘劖褰冮‖鍫熺節閳封偓閸愵喖寮板Δ鐘靛仦閸ㄦ寧鎱ㄩ埀顒勬煟濮楀棗浜濋柡鍌楀亾闂備浇顕ч崙鐣岀礊閸℃顩查柣鎰惈绾惧綊鏌ｉ幇顔煎妺闁抽攱鍨块幃妤呭捶椤撶倫锝夋煏閸℃鏆ｉ柡灞诲€濆畷姗€鎳犻鈧悡鐔哥節绾版ǚ鍋撳畷鍥х厽闂佽桨绀侀崐鍧楀箖閹呮殕闁逞屽墴閹線宕奸姀銏紲闂佸憡鎸嗛崘鐐瘔闂佽棄鍟虫ご鎼佸Φ閸曨垼鏁冩い顐枦閸氼偊姊洪崫鍕拱闁烩晩鍨辨穱濠囧箹娴ｈ倽褔鏌涘☉鍗炲箻闁靛牜鍣ｉ弻锝嗘償閵堝孩缍堝┑鐐村絻缁绘ê鐣烽弴銏犵闁芥ê顦遍崝锕€顪冮妶鍡楃瑨闁挎洩濡囩划鏃堟偨閸涘﹦鍘遍棅顐㈡处濡垿鎳撶捄銊㈠亾鐟欏嫭绀冮柛銊ユ健閻涱喖顫滈埀顒勭嵁閸ャ劍濯撮柣鐔告緲閸樼偛鈹戦敍鍕杭闁稿﹥鐗犻獮鎰偅閸愩劎锛涘┑鐐村灟閸ㄥ湱绮诲ú顏呯厽闁靛繒濮甸崯鐐烘煃闁垮鐏撮柡灞剧☉閳规垿宕卞Δ濠佺磽婵＄偑鍊ら崑鎾剁不閹捐钃熸繛鎴炵懅缁♀偓闂佸憡鍔楅崑鎾绘偪娓氣偓閹鎲撮崟顒傤槶婵犫拃鍕垫畼闁瑰箍鍨归埞鎴犫偓锝庝簽閸婄偤鎮峰鍐闁靛棔绶氬畷銊р偓娑櫱氶幏铏圭磽閸屾瑧鍔嶉柨姘攽椤旇偐澧㈢紒杈ㄥ笚閹峰懐鎲撮崟顐㈡敪婵°倗濮烽崑娑氭崲閹寸姵宕叉繝闈涙－濞尖晜銇勯幘瀵糕姇閻庢俺妫勯埞鎴︽倷閼搁潧娑х紓浣藉紦缁瑩鐛径鎰櫢闁绘灏欓弻鍫ユ⒑缂佹ê濮夐柛搴涘€濋幃锟犳偐閸偄鏋戦梺缁橆殔閻楀棛绮閺岋綁鏁愰崶褍濡哄銈冨妸閸庣敻骞冨▎鎴炲珰鐟滃秵瀵奸幇鐗堢叄濞村吋鐟ч崚浼存煏閸℃ê绗掓い顐ｇ箞閹剝鎯旈敐鍕暰缂傚倸鍊搁崐鍝ョ矓閺夋嚚瑙勵槹鎼淬埄娼熼梺瑙勫礃椤曆呭閸忚偐绠鹃柛鈩兠悘銉モ攽閳ヨ尙鐭欓柡宀嬬畵瀹曟﹢濡搁妷銊ョ厴闂備礁鐤囬～澶愬垂閸фぜ鈧礁鈽夊Ο閿嬵潔濠电偛妫楃换鎰板绩椤撱垺鈷掑ù锝呮啞閹牓鏌￠崼顐㈠缂侇喗鐟╅獮瀣晝閳ь剟鎮￠垾鎰佺唵閻犺桨璀﹂悡顒佺箾缁楀搫濮傞柡灞剧洴椤㈡洟鎮╅幓鎺懶戦梻浣告啞閻熴儳绮旈崜浣诡潟闁规儳鐡ㄦ刊鏉懳旈敂钘夘嚋妞ゅ孩顨婂娲川婵炴碍鍨块獮鍐磼濮樿鲸娈鹃梺纭呮彧缁犳垹绮绘繝姘€甸梻鍫熺⊕閹叉悂鏌ｉ敃鈧悧鎾愁潖閸濆嫅褔宕惰娴煎牆鈹戦悙鏉垮皟闁糕€崇箰瑜版椽姊婚崒姘偓鐑芥嚄閸洖绠犻柟鎹愵嚙鎼村﹪鏌＄仦璇插姎闁汇値鍣ｉ弻鈩冨緞鐎ｎ亞浠奸梺鍝勬４缁犳捇寮婚敐澶婄睄闁稿本鑹炬禒姗€姊洪幖鐐插闁稿﹤缍婃俊鐢稿礋椤栨氨鐤€闂佸疇妗ㄧ拋鏌ュ磻閹捐鍐€鐟滃寮搁弮鍫熺參婵☆垯璀﹀Σ鎾煛閳ь剚绂掔€ｎ偆鍙嗗┑鐐村灦閿氭い蹇婃櫅闇夋繝濠傚暔閸嬨垽鏌＄仦鍓р姇缂佺粯鐩畷褰掝敊閻熼澹曞┑鐘绘涧濡盯寮抽敃鍌涚厪闊洢鍎崇壕鍧楁⒒閸曨偄顏柡灞剧☉閳藉顫滈崼婵呯矗闂備線鈧偛鑻晶鏌ユ煕閳哄倻澧遍柟骞垮灩閳规垹鈧綆鍋掑Λ鍐ㄢ攽閻愭潙鐏ラ柛鐔稿閹便劌鈽夊▎鎴狀啎闁诲孩绋掗…鍥儗閸℃瑧纾兼い鏃傛櫕閹冲啯銇勯銏㈢缂佽鲸甯掕灒閻犲洤妯婇埀顒佹尰缁绘盯骞橀弶鎴濇瘓闂佹悶鍔嶆繛濠傜暦濠靛浼犻柕澹拑绱冲┑鐐舵彧缂嶁偓婵炲拑绲块弫顔尖槈閵忥紕鍘遍梺鍝勫暊閸嬫捇鏌ｉ悢鏉戝姦闁诡噣绠栭幃婊堟寠婢光斂鍔庨幉鍛婂緞閹邦剛锛涢梺鐟板⒔缁垶寮查弻銉ョ閻庢稒顭囩粻姗€鏌熺粙娆炬█婵﹥妞藉畷顐﹀礋闂堟稑澹夐梻浣告惈鐞氼偊宕濋幋婵撹€垮〒姘ｅ亾婵﹨娅ｇ槐鎺懳熺拠鑼暡婵犵數鍋涢顓㈠礂濮椻偓閻涱喖螖閸涱喖浜圭紓鍌欑劍椤洭宕㈡潏銊х瘈闁汇垽娼у瓭闁诲孩鍑归崣鍐嚕閹剁瓔鏁嗛柛鏇ㄥ墰閸橀潧顪冮妶鍡樷拻闁告鍏撅絾绻濆顓犲帗闁荤姴娲ゅ鍫曞船婢跺瞼纾奸柣妯虹－濞插瓨顨ラ悙瀵告噰鐎规洘顭堥ˇ瀛樹繆椤愵偄鐏ｇ紒杈ㄦ崌瀹曟帒顫濋钘変壕濡炲瀛╂刊濂告煛鐏炶鍔氱痪鎯ь煼閺岀喖宕滆鐢盯鏌ｉ幘鍐叉殶闁硅尙顭堥…銊╁醇濠靛牜妲舵繝鐢靛仜濡瑩骞愰幖浣瑰亗婵せ鍋撻柡宀€鍠愬蹇斻偅閸愨晩鈧秹姊虹粙鍖″姛闁稿繑锕㈠濠氬Χ閸パ勭€抽梺鍛婎殘閸嬫盯锝為鍫熲拺闁告稑锕ョ粈瀣磼閻樺磭澧い顐㈢箰鐓ゆい蹇撳缁愭稒绻濋悽闈浶㈤柛鐔跺嵆瀹曪綁宕卞☉娆戝幗闁瑰吋鐣崹濠氬煝閹剧粯鐓涢柛娑卞枤缁犳﹢鏌?
  const MAX_PRE_GENERATE_COUNT = 2; // 闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻鐔兼⒒鐎靛壊妲紒鐐劤缂嶅﹪寮婚悢鍏尖拻閻庨潧澹婂Σ顔剧磼閻愵剙鍔ょ紓宥咃躬瀵鎮㈤崗灏栨嫽闁诲酣娼ф竟濠偽ｉ鍓х＜闁绘劦鍓欓崝銈囩磽瀹ュ拑韬€殿喖顭烽幃銏ゅ礂鐏忔牗瀚介梺璇查叄濞佳勭珶婵犲伣锝夘敊閸撗咃紲闂佽鍨庨崘锝嗗瘱闂備胶顢婂▍鏇㈠箲閸ヮ剙鐏抽柡鍐ㄧ墕缁€鍐┿亜韫囧海顦﹀ù婊堢畺閺屻劌鈹戦崱娆忓毈缂備降鍔岄妶鎼佸蓟閻斿吋鍎岄柛婵勫劤琚﹂梻浣告惈閻绱炴笟鈧妴浣割潨閳ь剟骞冨▎鎾崇妞ゆ挾鍣ュΛ褔姊婚崒娆戠獢婵炰匠鍏炬稑鈻庨幋鐐存闂佸湱鍎ら〃鎰礊閺嶃劎绡€闂傚牊渚楅崕鎰版煛閸涱喚鍙€闁哄本绋戦埥澶愬础閻愬樊娼绘俊鐐€戦崕鏌ユ嚌妤ｅ啫鐓橀柟瀵稿仜缁犵娀姊虹粙鍖℃敾妞ゃ劌妫濋獮鍫ュΩ閳哄倸鈧鏌﹀Ο渚Ш闁挎稒鐩铏圭磼濡搫顫庨梺绋跨昂閸婃繂鐣烽幋鐘亾閿濆骸鏋熼柣鎾跺枑娣囧﹪顢涘┑鍡楁優濠电姭鍋撳ù鐘差儐閻撳啰鎲稿鍫濈婵炴垶纰嶉鑺ユ叏濮楀棗澧婚柛銈嗘礋閺岀喓绱掗姀鐘崇亪濡炪値鍋勯幊姗€寮诲澶婄厸濞达絽鎲″▓鏌ユ⒑缂佹绠栨繛鑼枎椤繒绱掑Ο璇差€撻梺鑺ッ敍宥夊箻缂佹鍙嗗┑顔斤供閸樿绂嶅鍫熺叆闁哄啫娴傞崵娆撴煛鐎ｃ劌鈧妲愰幒鎾寸秶闁靛瀵屽Λ鍐倵濞堝灝鏋熼柟姝屾珪閹便劑鍩€椤掑嫭鐓冮梺娆惧灠娴滈箖姊鸿ぐ鎺濇缂侇噮鍨抽幑銏犫槈濞嗘劗绉堕梺鍛婃寙閸愩劎鍘掗梻鍌欒兌椤㈠﹪顢氬鍛床婵犻潧妫涢弳锔姐亜閺嶎偄浠﹂柛濠勫厴閺岋綁骞嬮悜鍡欏姺闂佸憡锕㈡禍璺侯潖濞差亜浼犻柛鏇ㄥ亝濞堟煡姊虹憴鍕€愮紒鐘崇墵楠炲啯銈ｉ崘鈺佷缓缂佸墽澧楅敋濞存粓绠栭幃宄扳枎韫囨搩浠剧紒鐐劤椤兘寮诲☉妯滄棃鍩€椤掑嫬鐤柛褎顨忛弫瀣煥濠靛棙顥犳い鈺冨厴閹鏁愰崨顖欑驳闂佸搫鎳忕换鍫濐潖濞差亝顥堟繛鎴炴皑閻ｉ箖姊洪崫鍕櫤缂侇喗鎹佸Λ銏ゆ⒑閻愯棄鍔滈柡瀣偢瀵劍绂掔€ｎ偆鍘藉┑鈽嗗灥濞咃絾绂掑☉銏＄厸闁糕€崇箲濞呭懘鏌嶇憴鍕伌妞ゃ垺鐟╅幃娆擃敆娴ｅ湱妲戦梻鍌欑閹芥粍鎱ㄩ幘顔芥櫇闁靛牆顦介弫鍥煕韫囨洖甯剁紒鍓佸仱閹鏁愭惔婵堣兒缂備降鍔岄悘姘辨崲濠靛鍋ㄩ梻鍫熺◥缁泛鈹戦埥鍡椾簼闁荤啿鏅犻悰顕€骞囬鐘电槇濠殿喗锕╅崢鍏肩濡ゅ懏鈷戠紓浣股戦悡銉╂煕濮橆剦鍎旈柟顔光偓鏂ユ瀻鐎电増绻傜紞濠囧箖閳╁啯鍎熼柨婵嗘閸犳牗绻濋悽闈涗沪闁搞値浜畷姗€宕滆閺佹悂鏌ｉ悢鍝ョ煁缂侇喗鎸搁悾閿嬪閺夋垵鍞ㄥ銈嗘尰缁嬪牓宕戦幘缁樻櫇闁稿本绋戝▓鎴濐渻閵堝棛澹勭紒鏌ョ畺椤㈡捇宕堕浣叉嫽婵炶揪缍€椤宕戦悩缁樼厱闁哄倽娉曢悞鎼佹煙椤斿搫鍔﹂柟顔瑰墲閹棃顢欓崗纰卞悪婵犵數濮烽弫鍛婃叏閻㈤潧鏋堢€广儱顦悿楣冩煙缂佹ê淇柣鏂挎閹綊鎼归悷鎵闂佽　鍋撶紓浣骨滄禍婊堟煏婢舵稑顩紒鐘靛仦閹便劍绻濋崘鈹夸虎閻庤娲滈崗姗€銆佸Ο娆炬Ь闂佸憡姊归幃鍌炲蓟閿濆棙鍎熼柨娑樺缁敻鏌ｉ姀鈺佺仭閻㈩垳鍠栭幃妯尖偓锝庡枟閳锋垿鏌熺粙鍨劉缂佲偓閳ь剟姊虹粙鍖″伐缂傚秴锕畷鍝勨槈閵忕姷顓洪梺鎸庢⒒閺咁偊宕㈤崡鐐╂斀闁绘绮☉褎淇婇锝庢疁妞ゃ垺妫冮、妤佹媴閸忓摜鐩庢俊鐐€栭崝锕傚礈濞戙垺鍋╅柣銏犳啞閻撴盯鎮橀悙鎻掆挃闁愁垱娲滅槐鎺旂磼濡偐鐤勯悗瑙勬礃閿曘垽銆侀弮鍫濆耿婵炲棙鍔栫欢浼存⒒閸屾艾鈧兘鎳楅崜浣稿灊妞ゆ牗绋撻悷瑙勪繆閵堝懏鍣归梻鍌ゅ灦閺屻劌鈹戦崱妯侯€涢梺鎼炲€栧ú鏍箒闂佺粯锚濡﹪宕曡箛娑樼畾闁绘柨鍚嬮埛鎴︽煙缁嬪灝顒㈢痪鍓ф暬閺屾稓鈧綆鍋呯亸浼存煏閸パ冾仾闁诡垱妫冩慨鈧柍銉ョ－閿涙捇姊绘担鍛婃儓闁活厼顦辩槐鐐寸瑹閳ь剟鐛崘顔碱潊闁靛牆鎳嶇槐鍫曟⒑闂堟侗妾х紒鐘冲灥閳诲秹骞嬮敂瑙ｆ嫼闁荤姴娲﹁ぐ鍐敆閵忋倖鐓熸い鎾楀啯鐝濋悗瑙勬穿缁绘繂鐣峰Ο渚晠妞ゆ柨鍚嬮鎸庝繆閻愵亜鈧牠宕濊閳ь剟娼ч惌鍌氼嚕椤愶箑纾奸柣鎰嚟閸樺崬顪冮妶鍡楀闁稿﹥娲熷鎶芥焼瀹ュ棛鍘垫俊鐐差儏濞撮鏁☉姘辩＜缂備焦顭囬埊鏇熺箾閻撳海绠荤€规洘绮忛ˇ鏌ユ煕閳轰胶鐒告慨濠呮濞戠敻宕担鍛婄杺缂傚倷鑳剁划顖滄崲閸岀偞鍋╅柣鎴犵摂閺佸秹鏌ｉ幇顓熺稇闁逞屽墰閸忔﹢寮婚敐澶婎潊闁靛繆鍓濆В鍕⒑閹稿海鈯曠紒顔芥崌瀵鏁愭径瀣汗闂佸憡鐟ラˇ顖炈囬埡鍛仭婵犲﹤瀚欢鏌ユ煕閻斿憡灏﹂柕鍡曠窔瀵噣宕奸锝嗘珝闂備胶绮敃鈺呭磻閸曨剛顩插Δ锝呭暞閸嬧剝绻涢崱妤冪妞ゅ浚浜炵槐鎺楀焵椤掑嫬绀冮柍鍝勫暟椤旀洟姊洪懖鈹炬嫛闁告挻鐟╁鎼佸箣濠垹閰ｅ畷鎯邦檪闂婎剦鍓熼弻鐔兼惞椤愩倗鐓夊┑鈽嗗亜閸燁偊鍩ユ径濠庢僵閺夊牃鏅涚粊锕€鈹戦悩鍨毄濠殿喚鍏樺顐﹀箹娴ｅ摜锛熼梺褰掑亰閸擄箓鎮㈤崱妞曞綊鏁愰崼鐕佷哗婵炴垶鎸哥粔褰掑蓟閻旂厧绠查柟浼存涧濞堫參姊洪挊澶婃殶闁哥姵鍔楅幑銏犫槈閵忕姷顓哄┑鐐叉缁绘帗绂掓總鍛娾拺闁告稑顭▓鏇炩攽閻愯韬€殿喖顭峰鎾偄閾忚鍟庨梻浣稿閻撳牓宕伴弽銊﹀弿闁靛骏绱曠粻楣冩倵閻㈡鐒炬い搴＄焸閺屾稑鈻庤箛鎾存濡炪値鍋勭换鎰弲濡炪倕绻愮€氼亞妲愰崼鏇熲拺闁告稑锕ユ径鍕煕閹惧鎳冮柍璇茬Ч婵¤埖寰勭€Ｑ勫缂傚倸鍊烽悞锕佹懌闂佽鍨伴悧蹇曟閹烘梻纾兼俊顖濆亹閻ｉ潧顪冮妶鍡樼┛缂佹彃娼￠獮蹇涙偐鐟佷礁婀遍埀顒婄秵閸嬫帒顭囬弮鈧换婵嗏枔閸喗鐏嶉梺鎸庢磵閺呯姴鐣烽幋锕€宸濋柡澶嬪灩椤︿即姊洪崨濠傚Е闁哥姵顨婇崺娑㈠箣閿旂晫鍘卞┑鐐村灦閿曨偊寮ㄦ繝姘€甸柛顭戝亞閹冲洭鏌＄仦鐣屝ユい褌绶氶弻娑㈠箻閺夋垵鎽靛Δ鐘靛仜閻楁挻淇婇幖浣哥厸濞达絽鎼埀顒傚仜椤啴濡堕崱妤冪憪闁荤姳鐒﹂悡锟犵嵁韫囨稒鎯為柛锔诲幘閿涙繈姊虹粙鎸庢拱闁荤啙鍥х鐎广儱妫庢禍婊勩亜閹捐泛浠︾€瑰憡绻勭槐鎺楊敊绾拌京鍚嬮悗娈垮枙缁瑩銆侀弴銏″亜闁炬艾鍊搁ˉ姘舵⒒娴ｄ警鐒剧紒缁樺姍钘濇い鏍ㄧ〒椤╂煡鏌涢幘妤€鎳愰敍婵囩箾鏉堝墽鍒板鐟帮躬瀹曟洟骞囬婊€绨婚梺鐟邦嚟閸嬬喖骞婇崘鈹夸簻妞ゆ挾鍋為崰妯尖偓娈垮枙缁瑩銆佸鈧幃銏ゅ传閸曨偄寮烽梻鍌氬€搁…顒勫磻閸曨個娲晝閸屾氨顦╅梺鑽ゅ枛閸嬪﹪鎮炴禒瀣厵闁规鍠栭。濂告煕婵犲倻浠涢柟渚垮妼椤粓宕卞Δ鈧粻褰掓⒑閸涘﹦绠栨俊鐐扮矙瀵鏁嶉崟顏呭媰闂佷紮绲介惈妤勵槻闁宠鍨块弫宥夊礋椤愩垹绠ｅ┑鐘殿暯閸撴繈骞冮崒鐐叉瀬闁稿瞼鍋涚粻姘辨喐鎼淬劍鐓ユい鎾卞灪閳锋帡鏌涚仦鍓ф噭缂佷胶澧楅妵鍕即閸℃鍣虹€规洘鐓￠弻鐔兼焽閿曗偓閸旓附绻涢幋鐐冩艾危閸喐鍙忔慨妤€妫楀鐐箾閼测晛鏋涙慨濠呮閹叉挳宕熼銏犘戞俊鐐€栧ú锕傚矗閸愵喖绠栭柣銈庡灛娴滃綊鏌熼悜妯诲暗闁告﹢浜跺娲濞戣鲸效闂佹悶鍔庨弫鎼佸焵椤掍礁鍤柛鐘愁殘缁顓兼径濠囧敹闂佸搫娲ㄩ崯鍧楀箯缂佹绠鹃弶鍫濆⒔缁夘剚淇婇銏狀伃鐎规洏鍎撮妵鎰板箳閹捐泛骞堥梻浣虹帛濡啴寮ㄩ柆宥呯；闁靛／鈧崑鎾斥枔閸喗鐏嶉梺缁樻惈缁绘繈鐛崘顔肩厸闁告劦浜為敍婊冣攽閳藉棗鐏ユ俊妞煎妿閸掓帟顦冲ǎ鍥э躬閹瑩顢旈崟銊ヤ壕闁哄稁鐏愰崫鍕靛悑濠㈣泛锕﹂敍娑㈡⒑鐟欏嫬鍔ら柣蹇撶墦瀹曟垿骞橀懜闈涙瀭闂佸憡娲﹂崜娑⑺囬妸鈺傗拺闁圭瀛╃壕鎼佹煕閵娿倗鐭欏┑鈥崇摠閹峰懐鍖栭弴鐔衡偓濠氭⒑閻熸壆鎽犵紒璇插暣閹骞庨懞銉у幐婵犮垼娉涢敃锔芥櫠閹达附鐓曢柡鍌涘閹癸絿绱掗鑺ヮ棃闁哄苯妫楅濂稿幢韫囨柨顏洪梻鍌欒兌椤牓寮甸鍕仭鐟滃繒鍒掗敐澶婄睄闁逞屽墰閹广垹鈽夊▎鎰€撻梺鍛婂姇瀵爼宕抽搹鍏夊亾鐟欏嫭绀冮柣鎿勭節瀵鈽夐姀鈺傛櫇闂佺粯蓱瑜板啯鎱ㄦ惔銊︹拺闁硅偐鍋涙俊濂告煕婵犲啯鍊愰柛鈺冨仱楠炲鏁傞挊澶夋睏闁诲氦顫夊ú鏍归崒鐐叉辈闁跨喓濮甸埛鎴犵磼鐎ｎ偒鍎ラ柛搴＄箻閺屾稒绻濋崒娑樹淮閻庢鍠栭…鐑藉箖閵忋倖鍋傞幖杈剧秵濡插爼鏌ｉ悢鍝ョ煀缂佺粯甯″顐︻敊鐏忔牗顫嶉梺闈涢獜缁辨洟宕㈡禒瀣拺閻熸瑥瀚粈鍐╃箾婢跺娲寸€殿喚顭堥埥澶愬閿涘嫬骞愰柣搴″帨閸嬫捇鎮楅敐搴″闁糕晛鐭傞弻褎瀵煎▎鎴犘滈梺鍝勬湰缁嬫垿鍩為幋锕€骞㈡俊銈咃梗閹絿绱撻崒娆戝妽妞ゃ劌绻樺畷锝夊礃椤垶缍庡┑鐐叉▕娴滄繈宕戦崒鐐茬缂侇喛顫夐～濠冧繆椤愩垺婀扮紒缁樼〒閳ь剚绋掗…鍥儗閵堝悿鐟邦煥鎼存繄鐩庡銈嗘穿缁插潡骞忛悩瑁佸湱鈧綆鍋掑鏃堟⒒娓氣偓濞佳呮崲閹烘挻鍙忛柣銏℃綄婢跺ň鏀介柛鈥崇箲閺傗偓闂備胶绮崝鏇烆嚕閸泙澶愭倷閻戞鍘遍柟鍏肩暘閸ㄥ綊鍩㈤弴鐘亾鐟欏嫭绀冪紒顔肩Ф閳ь兛绲婚崑鎰板焵椤掍胶鈯曢懣銈夋煙?濠电姷鏁告慨鐑藉极閸涘﹥鍙忛柣鎴ｆ閺嬩線鏌涘☉姗堟敾闁告瑥绻橀弻锝夊箣閿濆棭妫勯梺鍝勵儎缁舵岸寮诲☉妯锋婵鐗婇弫楣冩⒑閸涘﹦鎳冪紒缁橈耿瀵鏁愭径濠勵吅闂佹寧绻傚Λ顓炍涢崟顖涒拺闁告繂瀚烽崕搴ｇ磼閼搁潧鍝虹€殿喛顕ч埥澶娢熼柨瀣垫綌婵犳鍠楅〃鍛存偋婵犲洤鏋佸Δ锝呭暞閳锋垿鏌涘☉姗堝姛闁瑰啿鍟扮槐鎺旂磼濮楀牐鈧法鈧鍠栭…鐑藉极閹邦厼绶炲┑鐘插閸氬懘姊绘担鐟邦嚋缂佽鍊歌灋妞ゆ挾鍊ｅ☉銏犵妞ゆ牗绋堥幏娲⒑閸涘﹦绠撻悗姘卞厴瀹曟洘鎯旈敐鍥╋紲闂佸吋鎮傚褔宕搹鍏夊亾濞堝灝鏋涙い顓犲厴楠炲啴濮€閵堝懐顦ч柣蹇撶箲閻楁鈧矮绮欏铏规嫚閺屻儱寮板┑鐐板尃閸曨厾褰炬繝鐢靛Т娴硷綁鏁愭径妯绘櫓闂佸憡鎸嗛崪鍐簥闂傚倷娴囬鏍垂鎼淬劌绀冮柨婵嗘閻﹁京绱撻崒姘偓椋庢閿熺姴闂い鏇楀亾鐎规洖缍婇獮搴ㄦ寠婢跺矈鍞归梻渚€娼х换鎺撴叏椤撶倣锝夊醇閵夛妇鍘棅顐㈡处濞叉牕鏆╂俊鐐€栭幐鎼佸箹椤愶箑鐓橀柟杈鹃檮閸婄兘鏌涘▎蹇ｆ▓婵☆偆鍋熺槐鎾存媴閾忕懓绗￠柣銏╁灡椤ㄥ牏鍒掔€ｎ喖绠抽柟鎯у船娴滄繈姊洪崨濠傚闁哄倷绶氶獮蹇涙惞閸︻厾锛濇繛杈剧到婢瑰﹪宕曢幇顓滀簻闁瑰鍋熼幊鍥┾偓瑙勬礃濞叉繄绮诲☉銏犳閻犱礁纾惄搴ㄦ⒒娴ｇ儤鍤€闁宦板妿閹广垹顓奸崨鍌滃枛閸┾偓妞ゆ帒瀚埛鎴︽偣閸ワ絺鍋撻搹顐ゅ讲缂傚倷鑳剁划顖滄崲閸儱违濞撴埃鍋撶€殿喗鎸虫慨鈧柍鈺佸暞閻濇牠姊绘笟鈧埀顒傚仜閼活垱鏅堕幘顔界厵妞ゆ梻鏅幊鍕磼缂佹绠炵€规洖鐖兼俊姝岊槻閻㈩垱鍎抽埞鎴︽偐閸偅姣勯梺绋款煬閸ㄥ爼宕洪埀顒併亜閹烘垵顏╃痪鎯ь煼閺岀喖宕滆缁♀偓缂備浇顕уΛ婵嬪蓟閻旇櫣纾兼俊顖濇椤戝倹绻濋埛鈧澶嬵€嶉梺閫涚┒閸斿秶鎹㈠┑瀣闁崇懓銇橀搹搴ㄦ煟鎼淬値娼愭繛璇х畵瀹曟垶绻濋崒婊勬闂佺粯鏌ㄩ崥瀣夐崼鐔虹闁瑰浼濋鍩跺鈧綆鍓涚壕浠嬫煕鐏炴崘澹橀柍褜鍓熼ˉ鎾诲箯鐎ｎ喖钃熼柕澶堝劤閿涙盯姊洪悷鏉库挃闁稿鍔戦崺鈧い鎺嶇缁楁帗銇勯锝囩疄闁轰焦鍔欏畷銊╊敆閳ь剟藟濮樿埖鈷掗柛灞剧懆閸忓瞼鐥鐐靛煟鐎殿喗褰冮埞鎴犫偓锝庝簽閿涙盯姊洪棃娑氬妞わ箑宕悾鍨瑹閳ь剟骞冨Δ鍛櫜閹肩补鍓濋悘宥夋⒑閸濆嫭鍣虹紒顔芥崌瀵鏁冮埀顒冪亽婵炴挻鍑归崹鍗炴毄濠电姵顔栭崰娑綖婢舵劑鈧啯绻濋崶褑鎽曢梺鎸庣箓濡瑩宕曢悢鍏肩厪闁割偅绻傞銏㈢磽瀹ュ懐澧曢柍瑙勫灴閹瑩骞撻幒鏃堢崜闂備胶绮〃鍡椕洪悢鍑よ€垮〒姘ｅ亾婵﹨娅ｇ划娆戞崉閵娧傜礃闂備胶顭堥鍡欑矙閹寸偞娅忛梻浣告惈鐞氼偊宕曢弻銉﹀亗闁靛鏅滈悡鐔兼煛閸屾稑顕滈柟顖氱墦瀵粙鏁撻悩鏂ユ嫼闂佽鍎兼慨銈夊极闁秵鐓曢柕濞垮劜鐠愨剝淇婇崣澶婂妤犵偞甯″顒勫传閸曨亜顥氶梻浣瑰缁诲倹顨ラ崨濠勵洸濞寸姴顑嗛悡鏇㈠箹鐎涙鈽夐柛鏃撶畵閺岋紕浠﹂崜褉濮囬梺璇″灡濡啴寮澶婄妞ゆ挆鍐╂珨闂傚倸鍊风粈渚€骞栭锕€瀚夋い鎺戝€婚惌娆撴煙閻戞ɑ鈷愮€规洖寮剁换婵嬫濞戝崬鍓扮紒鐐劤閸氬鎹㈠☉銏犵闁诲繗宕甸崢褑褰佸銈嗘磵閸嬫捇鏌″畝瀣ɑ闁诡垱妫冩慨鈧柍杞扮劍濞呮盯姊绘担鍛婃喐濠殿喚鏁婚幃褔鎮╃拠鑼紜闂佹寧娲栭崐褰掓偂閵夆晜鍊甸柨婵嗗€瑰▍鍥╃磼閻樺啿鍝烘慨濠冩そ瀹曟宕楅悡搴樺亾閹邦厾绠惧ù锝呭暱閹冲繘顢曟禒瀣厽闁归偊鍘鹃妶鎾煛閳ь剚绂掔€ｎ偆鍘藉┑鈽嗗灥濞夋洜鑺遍崸妤佺厱闊洦鎸鹃悞鎼佹煛瀹€瀣М妤犵偛娲、妤佺節閸涱厽鍎撳┑鐘愁問閸犳牠鏁冮敂鎯у灊妞ゆ牗绮庣粻鏃堟煟閺冨倸甯堕柣鎺戠仛閵囧嫰骞掗崱妞惧婵＄偑鍊ら崢鐓幟洪埡鍚藉洩銇愰幒鎾崇檮濠电娀娼ч弸纭呫亹閹烘挸浜归悗鐟板閸犳牠宕滈幍顔剧＝濞达絿鎳撴慨鍫熴亜閵娿儲顥炵紒宀冮哺缁绘繈宕堕‖顑洦鐓曢悘鐐插⒔閻擃垰顭跨憴鍕婵﹦绮幏鍛村传閵夘垳绀婄紓鍌欑贰閸ｎ噣宕归崼鏇犲祦闁硅揪绠戦悙濠冦亜閹烘垵鈧摜绮婇敃鍌涘€垫鐐茬仢閸旀碍銇勯敂璺ㄧ煓鐎殿噮鍋呯换婵嬪炊閵娧冨箞闂備礁婀遍崑鎾汇€冮崨顖滅煋闁割偅娲橀埛?

  const {
    startTourRecordingArchive,
    finishTourRecordingArchive,
    loadTourRecordingMeta,
    renameSelectedTourRecording,
    deleteSelectedTourRecording,
  } = useTourRecordings({
    clientIdRef,
    activeTourRecordingIdRef,
    selectedTourRecordingIdRef,
    setSelectedTourRecordingId,
    refreshTourRecordingOptions,
    getCurrentTtsProfile: () => ({
      provider: ttsMode,
      voice: ttsMode === 'modelscope' || ttsMode === 'flash' ? modelscopeVoice : '',
      speed: ttsSpeed,
    }),
  });
  const { startStatusMonitor } = useQueueStatusMonitor({
    ttsManagerRef,
    requestSeqRef,
    getIsLoading: () => isLoading,
    setQueueStatus,
  });

  /* legacy (kept for reference)
  async function startTourRecordingArchive(stops) {
    const list = Array.isArray(stops) ? stops.map((s) => String(s || '').trim()).filter(Boolean) : [];
    if (!list.length) return '';
    const data = await fetchJson('/api/recordings/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-ID': clientIdRef.current },
      body: JSON.stringify({ stops: list }),
    });
    const rid = String((data && data.recording_id) || '').trim();
    if (rid) activeTourRecordingIdRef.current = rid;
    return rid;
  }

  async function finishTourRecordingArchive(recordingId) {
    const rid = String(recordingId || '').trim() || String(activeTourRecordingIdRef.current || '').trim();
    if (!rid) return;
    try {
      await fetchJson(`/api/recordings/${encodeURIComponent(rid)}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-ID': clientIdRef.current },
        body: JSON.stringify({ ok: true }),
      });
    } catch (_) {
      // ignore
    }
  }

  async function loadTourRecordingMeta(recordingId) {
    const rid = String(recordingId || '').trim();
    if (!rid) return null;
    try {
      return await fetchJson(`/api/recordings/${encodeURIComponent(rid)}`);
    } catch (_) {
      return null;
    }
  }

  const refreshTourRecordings = async () => {
    try {
      await refreshTourRecordingOptions();
    } catch (_) {
      // ignore
    }
  };

  const renameSelectedTourRecording = async () => {
    const rid = String(selectedTourRecordingIdRef.current || '').trim();
    if (!rid) return;
    const next = window.prompt('闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻鐔兼⒒鐎靛壊妲紒鐐劤缂嶅﹪寮婚悢鍏尖拻閻庨潧澹婂Σ顔剧磼閻愵剙鍔ょ紓宥咃躬瀵鎮㈤崗灏栨嫽闁诲酣娼ф竟濠偽ｉ鍓х＜闁绘劦鍓欓崝銈嗙節閳ь剟鏌嗗鍛姦濡炪倖甯掗崐褰掑吹閳ь剟鏌ｆ惔銏犲毈闁告瑥鍟悾宄扮暦閸パ屾闁诲函绲婚崝瀣уΔ鍛拺闁革富鍘奸崝瀣煕閵娿儳绉虹€规洘鍔欓幃娆撴倻濡桨鐢绘繝鐢靛Т閿曘倝宕幍顔句笉闁煎鍊愰崑鎾斥枔閸喗鐏嶆繝鐢靛仜閿曨亜顕ｉ锕€绀冩い鏃囧亹閿涙粌鈹戦悙鏉戠仸闁煎綊绠栭悰顕€宕奸悢鍓佺畾闂佺粯鍔︽禍婊堝焵椤戞儳鈧繂鐣烽姀锛勵浄閻庯綆浜滈悗顓㈡⒑閸撹尙鍘涢柛瀣閵嗗懘宕ｆ径宀€鐦堥梻鍌氱墛娓氭宕曢幇鐗堢厽闁规儳鐡ㄧ粈鍐磼缂佹娲寸€规洖宕灃闁告劦浜堕崬铏圭磽閸屾瑨鍏屽┑顔芥尦閳ワ箓鎮滈挊澶庢憰闂佹寧绋戠€氼亜鈻介鍡欑＜閻庯綆浜炴禒銏ゆ煃瀹勯偊妯€闁诡喗顨婂畷褰掝敃閿濆洤鍤掗梺璇插閸戝綊宕抽敐澶婃槬闁逞屽墯閵囧嫰骞掗幋顖氬缂備礁顦靛褔婀佸┑鐘诧工鐎氼喚绮婚悙娣簻闁靛骏绱曢幊鍥┾偓瑙勬磸閸旀垿銆佸Ο琛℃婵炲棙鍔栧鎴︽⒒閸屾瑨鍏岀紒顕呭灦瀹曟繈寮撮悜鍡楁闂佸壊鍋呭ú鏍偂濠靛鐓涢柛銉㈡櫃缁辨娊鏌ｉ悢鐓庝喊闁绘挶鍎甸弻娑㈠即閵娿儱绠婚梺缁樻尫缁舵艾顫忛搹鍦煓闁割煈鍠氬Σ浼存⒑缁嬫鍎忛柨鏇樺€濋敐鐐剁疀閺囩姷锛滃┑鈽嗗灥椤曆囶敁閹剧粯鈷戦柛娑橈功缂傛岸鏌涙惔銏㈠弨闁诡喗顨婇、娆戜焊閺嶃劍鏉搁梻浣规灱閺呮盯宕妸锔绢浄闁绘绮悡鏇㈡煛閸屾繃纭堕柣鎺戞啞缁绘繈鍩€椤掍胶鐟归柍褜鍓欓～蹇撁洪鍕啇闂佺粯鍔栬ぐ鍐╂叏閸洘鈷戦柛娑橈攻鐏忎即鏌ｉ悢婵嗘噹閸ㄦ繈鎮归崶顏嶆⒖婵炲樊浜堕弫鍌炴煕濞戝崬鐏犳鐐村姍濮婄粯鎷呯憴鍕哗闂佺瀵掗崳锝咁嚕閹绘巻妲堥柕蹇曞Т閸ゆ垿姊洪崫鍕殭闁稿﹨宕垫竟鏇熺附閸涘﹦鍘撻梻浣诡儥閸ㄧ増绂嶆ィ鍐┾拺缂佸顑欓崕鎰版煙閻熺増鎼愭い顐㈢箳缁辨帒螣閼测晜鍤岄梻渚€鈧偛鑻晶顔姐亜椤撶偞绌挎い锕佹珪閵囧嫰濡搁敐鍛Г缂備胶濮甸惄顖氼嚕閹绢喗鍊烽柣銏㈡暩閹藉矂姊婚崒娆戭槮闁硅绻濋獮鎰板幢濞戞顦板銈嗗姂閸ㄥ湱绮婚崣澶岀瘈鐎典即鏀卞姗€鍩€椤戭剙鎳庣欢銈吤归悩宸剰闁汇値鍠楅妵鍕冀椤愵澀娌梺绋款儏閸婂湱鎹㈠☉銏犵婵炲棗绻掓禒楣冩⒑缂佹ɑ灏版繛鍙夛耿婵＄敻宕熼姘辩杸闂傚倸鐗婄粙鎰姳缂佹绠鹃悗娑欘焽閻绱掗鑲╃劯闁炽儻绠撻幊妤咁敍閿濆柊鈺呮⒒娴ｅ壊鍚旈柡澶婄仢椤洦绻濈喊澶岀？闁轰浇顕ч悾鐑芥偄绾拌鲸鏅┑顔矫崥瀣礊閸岀偞鈷掑ù锝堫潐閻忛亶鏌￠崨顔炬创鐎规洦鍨辩€电厧顫㈤妶鍛閻庝絻鍋愰埀顒佺⊕鑿ら柟閿嬫そ濮婃椽鎳￠妶鍛€炬繝銏㈡嚀濡繈寮鍜佸悑濠㈣泛顑囬崢閬嶆煟鎼搭垳绁烽柛鏂跨焸閸┾偓妞ゆ帊鑳舵晶顒傜磼瀹€鍐摵缂佺粯绻堝畷鍫曞Ω閵夈垹浜惧┑鐘崇閻撶娀鏌熼鐔风瑨闁告梹绮嶇换娑㈠川椤斿墽鐓夊┑顔硷攻濡炶棄鐣烽妸锔剧瘈闁告劦鐓堝Σ閬嶆⒒娴ｅ憡鍟為拑閬嶆煕鎼淬垹鈻曢柛鈹垮灲瀵噣宕煎┑瀣殔婵犲痉鏉库偓鎾舵媼閺屻儱绠┑鐘崇閳锋垹绱掔€ｎ偄顕滄繝鈧导瀛樼厽闁绘洖鍊搁々顒傜磼椤旂》韬柟顔ㄥ洤閱囨繛鎴烆殘閻╁孩淇婇悙顏勨偓鏍礉閹达箑鏄ラ柛鏇ㄥ€犻悢鐓庣劦妞ゆ帒瀚崐鐢告偡濞嗗繐顏紒鈧崘鈺冪闁肩⒈鍓欓弸搴ㄦ煟閿濆懎妲绘い顐ｇ矒閸┾偓妞ゆ帒瀚粻鐘绘煟濡粯銇熼柡浣告闇夐柨婵嗙墱閸ゅ啴鏌涢悢鐑筋€楅柍瑙勫灴閺佸秹宕熼鈩冩線闂備胶顭堥敃銉╂偋濠婂牆鏋佹い鏇楀亾妤犵偞甯″顒勫传閸曨亜顥氭繝娈垮枟椤洭宕㈣椤曪綁顢欓柨顖氫壕閻熸瑥瀚粈鍐煕閺冣偓閻熴儵鎮鹃柨瀣檮缂佸鐏濆畵鍡涙⒑缂佹ɑ鐓ラ柟纰卞亞閺侇喖螖閸涱喒鎷绘繛杈剧到閹诧繝宕悙鐢电＜閻犲洦褰冮埀顒€顭烽崺鈧い鎺嶇閸ゎ剟鏌涢幘璺烘瀻妞ゆ洩缍侀獮搴ㄦ嚍閵夈儰绨婚梻浣瑰劤缁绘锝炴径鎰櫖闊洦绋掗埛鎴︽偣閸ワ絺鍋撳畷鍥ｅ亾鐠囪褰掓晲婢跺鐝抽梺鍛婂笚鐢€愁潖缂佹ɑ濯撮柛娑橈攻閸庢捇姊洪崗鍏笺仧闁搞劌纾崚鎺楀籍閸喎鈧姊洪幑鎰劷闁告柨绉剁划顓㈡偄閻撳海鍔﹀銈嗗笒鐎氼剟鎷戦悢鍝ョ闁瑰瓨鐟ラ悘鈺冪磼閻樺樊鐓奸柟顔肩秺閹煎綊鎮烽弶鍨瀱闂備浇顕ф鎼佲€﹀畡閭︽綎闁绘垶锚椤曡鲸绻涢崱妯虹仸闁稿瑪鍥ㄢ拺缂佸娉曠粻鏌ユ煥閺囨ê鐏查柟顔诲嵆椤㈡岸鍩€椤掑嫮宓侀柟鐑橆殔缁犵娀鏌ц箛锝呬簼闁抽攱鍔欓弻鐔风暋閻楀牆娅ч梺鍛婄墬閻楃姴顕ｉ幘顔藉€烽柡澶嬵儥濡粓姊婚崒娆掑厡缂侇噮鍨跺畷褰掑礂閸忕厧寮块梺闈涚墕椤︻垳澹曡ぐ鎺撶厽闁靛繒濮甸崯鐐烘煟閹捐泛鏋涢柡灞炬礉缁犳稒绻濋崘鐐秹闂備礁鎽滈崰搴ｆ崲濮椻偓瀵鏁愭径濠勵唺濠德板€曢崯浼村汲椤愶附鈷戦悹鍥ｂ偓铏亞缂備緡鍠楅悷鈺呭Υ娴ｇ硶妲堟俊顖炴敱椤秴鈹戦埥鍡楃仩闁圭⒈鍋夐。浠嬫⒒閸屾艾鈧绮堟笟鈧幃鍧楀炊椤掑﹦绋忔繝銏ｅ煐閸旀洟宕归崒鐐寸厱鐟滃酣銆冮崨顖滀笉闁哄稁鍘介悡鍐煕濠靛棗顏┑顖氥偢閺屸剝鎷呴棃鈺勫惈闂佸搫琚崐鏇㈡箒闁诲函缍嗛崑鍛存偟閹烘梻纾藉ù锝勭矙閸濇椽鎷戞潏鈺冪＜缂備焦顭囩粻鐐烘煙椤旇崵鐭欐俊顐㈠暙閳藉螖閸愨晛绀嬫繝纰夌磿閸嬫垿宕愯缁辨挸顫濈捄铏诡攨闂佽鍎煎Λ鍕不濮樿埖鐓曢柡鍥ュ妼閻忛亶鏌℃担鍝バч柡宀嬬秮楠炲洭顢涘杈嚄闂備椒绱徊鎯ь渻娴犲绠栫€瑰嫰鍋婇悡銉╂煕閺囥劌澧伴柛娆忔濮婄儤瀵煎▎鎴炲仹闂佺绻戦敋闁伙絿鍏橀弫鎾绘偐閸愭祴鍋撻悜鑺ョ厓闁告繂瀚禍鐐寸箾閸忓吋鈷愮紒缁樼箘閸犲﹤螣濞茬粯缍夐梻浣规偠閸斿秵绻涙繝鍥ф槬婵炴垯鍨归柋鍥ㄧ節閵忊晙鎮嶇紓宥勭窔楠炲啫顭ㄩ崼鐔锋疅闂侀潧顦崹铏光偓姘虫閳规垿鎮欑€涙ê闉嶉梺绯曟櫅閸熸潙鐣烽幋锕€绠婚悗闈涙憸椤旀洘绻涙潏鍓у埌闁哥喎鐏濈叅闁挎洖鍊哥壕濠氭倵閿濆骸鏋熼柣鎾存礋閺屽秹鍩℃担鍛婃濠电偛顦伴悡锟犲蓟濞戙垹唯闁挎繂鎳庨‖鍫濐渻閵堝棙绀嬪ù婊冪埣楠炲啫螖閳ь剟鍩ユ径濞炬瀺妞ゆ挆鍌滃嚬缂備礁鍊哥粔纾嬬亙闂侀€炲苯澧撮柛鈺冨仱楠炲鏁傞挊澶嗗亾閻戣姤鐓曟繛鍡楁禋濡牊淇婇顒傜瘈婵﹥妞藉畷鐑筋敇瑜忛崝绋款渻閵堝骸骞橀柛蹇旓耿閻涱噣宕橀鑺ユ闂佺粯锚閸熸寧绂嶅鍫熲拺缂佸娉曠粻娲煕鐎ｎ偄濮嶇€规洩缍佸畷鍗烆渻缂佹ɑ鏉搁梻浣虹帛椤洨鍒掗姘ｆ鐟滃孩绌辨繝鍥舵晝闁挎繂娲﹂崳浼存倵鐟欏嫭绀堥柡浣割煼瀹曟椽鍩€椤掍降浜滈柟鐑樺灥椤忣亪鏌ｉ幘璺烘灈妤犵偞鐗曡彁妞ゆ巻鍋撻柣蹇ｅ櫍閺岋綁骞欓崘銊т桓闂佸搫鏈粙鎴ｇ亙闂侀€炲苯澧寸€规洦鍨跺畷绋课旀繝鍐╂珨闂備焦瀵х换鍌毼涘☉顫偓鍛存倻閼恒儱鈧敻鏌ㄥ┑鍡欏嚬缂併劋绮欓弻娑㈠籍閳ь剟骞愰崘宸綎婵炲樊浜滃婵嗏攽閻樻彃鈧瓕顤傛繝鐢靛仜閻°劎鍒掓惔銊ョ；闁靛牆顦埀顑跨閳诲酣骞橀崘鎻掔ギ闂備線娼х换鍡楊瀶瑜旈獮蹇撁洪鍛嫼闂侀潻瀵岄崣搴ㄦ倿閻愵剛绠鹃柟缁㈠櫘濡垹绱掗纰辩吋妤犵偞顭囩槐鎺懳熼悡搴＄闂傚倷绀侀幉锟犲礉濡棿鐒婃繛鍡樺灩娑撳秶绱撴担鐧镐緵婵炲牅绮欓弻锝夊箛椤掑娈舵繝鈷€鍐粵妞ゃ劊鍎甸幃娆撳矗婢跺﹥鐏庨梻浣筋嚃閸燁偊宕惰閸炲爼姊洪棃娑氱濠殿喗娼欐晥闁哄被鍎查埛鎺楁煕鐏炲墽鎳呮い锔肩畵閺岀喓鍠婇崡鐐扮盎闁绘挶鍊濋弻銊╁即閻愭祴鍋撹ぐ鎺戠柧妞ゅ繐鐗婇埛鎺戙€掑锝呬壕闂侀€炲苯澧伴柛瀣洴閹崇喖顢涘☉娆愮彿濡炪倖鐗滈崑鐐烘偂閻斿吋鐓冮柛婵嗗瀹搞儵鏌ｈ箛銉╂妞ゃ劊鍎甸幃娆撳箵閹烘挻顔勬俊鐐€ら崑鍛垝閹捐鏄ラ柍褜鍓氶妵鍕箳閸℃ぞ澹曢梻浣风串缁蹭粙宕查弻銉稏婵犲﹤鐗嗛悞鍨亜閹烘垵顏ラ柍褜鍏涚粈渚€鍩㈡惔銊ョ闁哄鍨抽幃锝夋⒑鐠囪尙绠抽柛瀣Т铻為柛鏇ㄥ幘娑撳秵绻涘顔荤凹闁抽攱甯掗湁闁挎繂娲ら崝瀣煕閵堝倸浜鹃梻鍌欑閹诧繝鎳濇ィ鍐炬晞濠㈣埖鍔楀畵渚€鏌涢埄鍐炬畼闁哄棗妫濋弻娑㈠即閵娿儰绨婚梺璇插瘨閸欏啴骞冨Δ鍐╁枂闁告洦鍓涢ˇ銉モ攽閻愯尙婀撮柛鏃€鍨块獮鍡楃暆閸曨偆顔掔紓鍌欑劍椤洭宕㈡禒瀣拺闂傚牊绋撶粻鍐测攽椤旂偓鏆€规洦鍨堕幃娆撴倻濡厧骞楅梻浣筋潐閸庢娊鎮洪妸褏鐭嗛悗锝庡枟閻撴稓鈧厜鍋撻柍褜鍓熷畷浼村冀椤撶姴绁﹂梺绯曞墲閸戠懓顬婇妸鈺傗拺闁硅偐鍋涢埀顒侇殜瀹曚即寮介鐐舵憰闂佺粯姊婚崢褏绮堥崘顔界厱婵炲棗娴氬Σ鍝ョ磼閹邦厾娲存慨濠冩そ閺屽懘鎮欓懠璺侯伃婵犫拃鍐ㄧ骇闁靛洤瀚伴、鏇㈠閳哄倐锕傛煟閹惧崬鈧繈寮婚垾鎰佸悑閹肩补鈧磭顔愮紓鍌欒兌婵箖锝炴径鎰﹂柛鏇ㄥ灠缁犳盯鏌涢锝嗙妞ゅ骸绉瑰铏圭矙濞嗘儳鍓梺鍝勬噺缁酣骞戦姀鐘斀閻庯綆鍋掑Λ鍐ㄢ攽閻愭潙鐏ョ€规洦鍓熷畷婊堝箥椤斿墽锛濇繛杈剧稻瑜板啯绂嶆ィ鍐╃厽閹兼惌鍨崇粔鐢告煕鐎ｂ晝鍔嶇紒鍌氱Т椤劑宕奸悢鍝勫箥闂佸搫顦悧鍡樻櫠娴犲绀嗛柟娈垮枟閸嬫牗鎱ㄥΟ鍨厫闁绘挾鍠栭獮鏍庨鈧悘鍗烆熆鐟欏嫸鑰块柡灞炬礋瀹曞ジ濮€閳哄啫濮兼俊鐐€ら崑鍕崲閹邦喖寮叉俊鐐€曠换鎰板箠鎼粹檧鏋旈柕澶嗘櫆閳锋垿姊婚崼鐔恒€掑褎娲熼弻鐔煎矗婢跺本鍒涙繝娈垮枓閸嬫捇姊洪幐搴ｂ槈閻庢凹鍣ｉ、娆撳即閵忊檧鎷洪梺鍏肩ゴ閺備線骞忛敓鐘崇厱闁规儳顕幊鍥煕閳瑰灝鐏茬€规洖銈告俊鐑芥晜閹冪疄闂傚倷绀侀悿鍥綖婢舵劕纾块柧蹇ｅ亞椤╂煡鏌ｉ幇闈涘幐缂佽妫濋弻锝夊箛閸忓摜鐩庨梺閫炲苯澧柣妤佺矒瀵偊顢氶埀顒勭嵁閹烘嚦鏃堝焵椤掑嫭鍋い鏂款潟娴滄粓鏌″搴′簻濞寸媴绠撻弻娑氣偓锝庡墮閺嬫垿鏌曢崶褍顏紒鐘崇洴楠炴鎹勬笟顖涙緫闂傚倷鑳剁划顖炲箰妤ｅ啫绐楅柡宥庡幗閸嬪倹銇勯幇鍓佺暠闁绘劕锕弻鏇熺節韫囨洜鏆犻梺鍝勬椤ㄥ﹪骞冨Δ鈧埥澶娾枎閹寸姷鏉芥繝娈垮枛閿曘劌鈻嶉敐澶婄劦妞ゆ巻鍋撴繝鈧潏銊ュ灁妞ゆ挾鍎愰悞浠嬫煙閹殿喖顣奸柣鎾存礋閺屾洘绻涢崹顔煎闂佺顑冮崕鏌ャ€冮妷鈺傚€烽柟缁樺笚濞堫參姊虹€圭媭鍤欓梺甯秮閻涱喖螣閾忚娈鹃梺鎼炲劥濞夋盯寮埀顒勬⒒閸屾艾鈧绮堟担闈╄€块梺顒€绉寸壕鍧楁煏閸繃鍟掓繛鎴欏灩缁€鍐┿亜閺冨洦顥夊ù鐘冲浮濮婅櫣鎲撮崟顐㈠Б婵犫拃鍐╂崳濠㈣娲樼粋鎺斺偓锝庡亞閸橀亶鏌ｈ箛鏇炰粶濠⒀傜矙楠炲﹪宕ㄧ€涙ê浠梺褰掑亰娴滄粌鐣甸崱娑欑厸閻忕偛澧藉ú鎾煙椤旇娅呴柣锝囧厴瀹曟儼顦柟铚傚嵆濮婄粯鎷呴崨濠冨創闂佸吋妞块崹鍫曞极閸愵噮鏁傞柛顐ｇ箖閻庮剟姊洪崷顓烆暭婵犮垺锚椤斿繐鈹戦崶銉ょ盎闂佸搫绉查崝搴ㄥ煀閺囩喆浜?, '') || '';
    try {
      await fetchJson(`/api/recordings/${encodeURIComponent(rid)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: String(next || '').trim() }),
      });
    } catch (e) {
      alert(String((e && e.message) || e || 'rename_failed'));
    }
    await refreshTourRecordings();
  };

  const deleteSelectedTourRecording = async () => {
    const rid = String(selectedTourRecordingIdRef.current || '').trim();
    if (!rid) return;
    const ok = window.confirm('缂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻鐔兼⒒鐎靛壊妲紒鐐劤缂嶅﹪寮婚悢鍏尖拻閻庨潧澹婂Σ顔剧磼閻愵剙鍔ょ紓宥咃躬瀵鎮㈤崗灏栨嫽闁诲酣娼ф竟濠偽ｉ鍓х＜闁绘劦鍓欓崝銈囩磽瀹ュ拑韬€殿喖顭烽幃銏ゅ礂鐏忔牗瀚介梺璇查叄濞佳勭珶婵犲伣锝夘敊閸撗咃紲闂佺粯鍔﹂崜娆撳礉閵堝洨纾界€广儱鎷戦煬顒傗偓娈垮枛椤兘寮幇顓炵窞濠电姴瀚烽崥鍛存⒒娴ｇ懓顕滅紒璇插€块獮澶娾槈閵忕姷顔掔紓鍌欑劍椤洭宕㈤柆宥嗏拺闂傚牊绋撴晶鏇㈡煙閸愭煡鍙勬い銏℃椤㈡﹢濮€閿涘嫬骞愰梺璇茬箳閸嬫稒鏅堕挊澹濊櫣鈧稒菧娴滄粓鏌曡箛濠傚⒉缂佲偓鐎ｎ喗鐓涘ù锝囨嚀婵秶鈧娲栧畷顒勫煝鎼粹垾鐔煎箒瀹ュ洤浠辨慨濠傤煼瀹曟帒鈻庨幇顔哄仒婵＄偑鍊栧ú姗€鎮ч悩鑼殾鐟滅増甯掔粻顕€鏌﹀Ο渚Ш闁挎稒鐩娲濞戞艾顣哄銈忕畱瀹曨剟鎮鹃崹顐ょ懝闁逞屽墴瀵鍨鹃幇浣告倯闁硅壈鎻徊鑲╁垝閹剧粯鐓欓柛蹇撳悑閸庢鏌ｉ幘宕囧ⅵ鐎殿噮鍋婂畷鍗炩槈濞嗘垵甯楅柣鐔哥矋缁挸鐣峰鍐炬僵妞ゆ挾濮弨铏節閻㈤潧孝闁哥喍鍗冲浠嬪礋椤栨稓鍘卞┑鐐村灦閿曨偊宕濋悢鍏肩厱婵☆垱瀵чˉ澶嬨亜椤忓嫬鏆ｅ┑鈥崇埣瀹曞崬螣閻戞ɑ顔傞梻鍌欑窔濞艰崵寰婃繝姘？闂侇剙绉撮悡婵嬫煙閻愵剙澧柣鎾卞劦閺屾盯寮撮悙鍏哥驳濡炪倖姊瑰Λ鍐潖閾忓湱纾兼俊顖氭惈椤苯顪冮妶鍡樺闁告ü绮欏鏌ュ醇閺囥劍鏅滈梺鍓插亞閸犲骸鈻撻妸鈺傗拺鐟滅増甯掓禍浼存煕濡娼愮紒鍌氱Т椤劑宕奸悢鍝勫箥闂備礁鎲＄换鍌溾偓姘煎弮钘熸繝濠傚幘閻熼偊鐓ラ柛娑卞幒婢规洜绱撴担铏瑰笡缂佽鍊块、姘跺Ψ閳轰礁鍤戝銈嗗姀閹冲洭宕戦幘璇插嵆闁绘柧璀﹀ú鎼佹⒑闂堚晛鐦滈柛妯哄⒔婢规洘绺界粙璺ㄩ獓闂佸壊鍋呯粙鎴炰繆閸忚偐绠鹃柟纰卞幖閺嬬喐銇勯妸锝呭姦闁诡喗鐟╁畷锝嗗緞婵犲啰浜峰┑锛勫亼閸婃垿宕瑰ú顏佲偓锕傚醇閵夊娲獮搴ㄦ嚍閵壯冨箺闂備焦瀵х换鍌炈囬挊澹╂盯骞嬮悩鐢碉紲闁哄鐗勯崝宥囦焊娴煎瓨鐓欑€瑰嫮澧楅崵鍥煙閻撳海绉洪柟顔惧厴楠炲秹顢氶崨顓濊繕闂傚倸鍊搁崐鐑芥嚄閸洖纾块柣銏㈩焾閻ら箖鏌嶉崫鍕櫣闁搞劌鍊块弻娑㈩敃閿濆棛顦ㄩ梺绋款儐钃遍柕鍥у瀵噣宕奸悢鍛婎唶闂備胶顭堥鍡涘箲閸ヮ剙鏋侀柟閭﹀幗閸庣喐绻濋棃娑氬閻庡灚绮撳缁樻媴閸涘﹥鍎撳銈嗗灥閹虫﹢寮绘繝鍥ㄦ櫜濠㈣泛顑呮禍妤€顪冮妶鍡楀Ё缂佺姵鍨块幃娆愮節閸ャ劎鍘繝鐢靛Т缁绘劙銆呴浣典簻闁挎柨鎼崝婊呯磼缂佹绠撻柍缁樻崌瀹曞綊顢欓悾灞奸偗闂傚倷鑳剁划顖炴偋濠婂牆鍌ㄧ憸鏃堟晲閻愬墎鐤€闁哄洨濮烽敍婊冣攽閳藉棗鐏ユい鏇嗗浂鏁侀柟鍓х帛閳锋垿鏌涜箛娑欙紵闁煎壊浜弻娑欐償椤旇偐浠搁梺绯曟杹閸嬫挸顪冮妶鍡楀潑闁稿鎹囬弻娑㈡偄缁嬫妫嗗┑鈥冲级閸旀瑩鐛幒鎳虫棃鍩€椤掑嫭鍊块柛顭戝亖娴滄粓鏌熼崫鍕ら柛鏂跨Т閳规垿顢涘☉娆忓攭闂佽鍠栫紞濠傜暦閸洖唯闁靛鍎遍～姘節绾板纾块柛瀣У閹便劑濡堕崱娆屾敵婵犵數濮村ú锕傚吹鐎ｎ喗鈷掗柛顐ゅ枔閵嗘帞绱掗幇顔间沪缂佺粯绻堥幃浠嬫濞磋翰鍨介幃妤€顫濋悡搴♀拫闂佺粯渚楅崰姘跺焵椤掑﹦绉甸柛鐘愁殜閸╂盯骞掗幊銊ョ秺閺佹劙宕熼鍛Τ闂備浇銆€閸嬫挸霉閻撳海鎽犻柣鎾寸懄缁绘盯鎳犳０婵嗘暯闂備緡鍙庨崹閬嶅箞閵婏妇绡€濞达綀娅ｉ悡鎾绘倵鐟欏嫭绀堥柛鐘崇墵閵嗕礁鈽夊鍡樺兊闂佽褰冮鍥嵁閵忋倖鈷掗柛灞剧懄缁佺増銇勯銏╂Ч缂佹梻鍠栧畷鍗炍熺紒妯煎娇婵犲痉鏉库偓鏇㈠箠鎼达絽顥氱憸鐗堝笚閻撶喖鏌曡箛鏇炐ｉ柛鐔哄仱閺岋綁骞樼€涙顦伴梺鍝勮閸旀垵顕ｉ鈧畷鍓佹崉閻戞﹩鍞插┑掳鍊楁慨鐑藉磻閻愮儤鍋嬫繝濠傜墕閻掑灚銇勯幒宥堝厡闁愁垱娲滅槐鎺旀嫚閹绘巻鍋撻崸妤€鐏抽柡鍐ㄧ墕缁€鍐┿亜閺傛寧顫嶇憸鏃堝蓟濞戙垹绠涢柍杞扮椤牊绻濆▓鍨灍婵炲弶绮庡Σ鎰板箻鐎涙ê顎撶紓浣圭☉椤戝懎鈻撻銏＄厽閹兼番鍨归崵顒勬煕閻樺磭澧€规挸瀚板娲捶椤撶儐鏆┑鐘灪椤洨鍒掔紒妯肩瘈婵﹩鍘奸埀顒€鐏氱换娑㈠箣閻戝棔鐥銈呯箰閻楁粓寮笟鈧弻鐔煎礈瑜忕敮娑㈡煃闁垮鐏撮柡灞剧洴閺佸倻鎷犻幓鎺旑啋闂佹眹鍩勯崹閬嶆儎椤栫偛绠栧ù鐘差儛閺佸秵鎱ㄥΟ鐓庝壕闁轰礁澧界槐鎾存媴鐟欏嫧鎷婚梺鍝ュУ閻楁洟顢氶敐澶婄妞ゆ梻鈷堝濠囨⒑閹惰姤鏆滈柛瀣崌閺岀喐顦版惔锝呯缂備胶绮粙鎺戭焽韫囨稑绀堢憸蹇氣叢濠电姷鏁搁崑娑㈠箯閹寸姷绀婂ù锝夆偓娑氱畾闁诲孩绋掗…鍥╁姬閳ь剟姊洪幖鐐插姌闁告柨閰ｅ畷銏ゆ焼瀹ュ棌鎷洪柣鐔哥懃鐎氼剟宕濋妶鍡愪簻闁哄洢鍔岄獮妯肩磼椤旀鍤欓摶锝夋煠濞村娅囬柨娑欑矊椤啴濡堕崱妯锋嫽闂佸搫鎷嬮崑濠囩嵁婵犲洤鐐婃い顓熷灦椤旀棃姊虹紒妯哄婵炲吋鐟х划顓㈠箳濡や焦鍤夐梺鍝勭▉閻忔劘銇愰幒鎾存珳婵犮垼娉涢鍡涙偟瀹曞洨纾藉ù锝夋涧婵″潡鏌℃担绛嬪殭妞ゎ偄绻掔槐鎺懳熺拠宸偓鎾绘⒑閹呯闁硅櫕鎸剧划顓㈠灳閺傘儲鏂€闂佸疇妫勫Λ妤佺濠婂牊鐓曢柣鏂挎啞缂嶆垶銇勯弴顏嗙М鐎殿喖顭锋俊鐑芥晝閳ь剙鈻撻妶鍜佹富闁靛牆妫楃粭鍌滅磼閳ь剚鎷呯憴鍕妳婵犵數濮村ú锕傚煕閹寸姷纾兼い鏍ㄧ⊕缁€鈧繝鈷€鍕弨闁圭缍€椤︽煡妫佹径瀣瘈濠电姴鍊搁顐︽煟椤撶喎娴柡宀嬬磿娴狅妇鍖栭弴鐐板闂佸綊顣︾粈渚€骞冮幋锔解拺闁告稑锕ゆ慨鍌炴煕閺傝法鐒搁柍銉︾墱閳ь剨缍嗛崜娑氬閽樺褰掓晲閸涱喗鍎撻柡宥忕節濮婃椽鎮烽悧鍫濇殘闂佽鍠栭崐鎼佹晝閵忊剝濯寸紒顖涙礃閺傗偓闂備胶绮…鍫ヮ敋濠婂喚鍟呴柕澶嗘櫆閻撴洟鏌ｉ弮鍌ょ劸妞ゃ儱顑囩槐鎺楊敊閼恒儳鍙嗛柣鎾卞€栭妵鍕疀閹炬潙娅ч梺鍛婏耿濞佳団€旈崘顔嘉ч柛鈩冿供濮婂潡鎮楃憴鍕闁轰礁顭烽獮鍡欎沪鐟欙絾鐎婚梺瑙勫閺呮瑧鑺辨繝姘拺闂傚牊鐩悰婊呯磼鏉堛劍绀嬮柛鈹垮劜瀵板嫰骞囬鐘插笚闂備浇濮ら敋妞わ箒妫勫嵄闁告稑顭堟禍婊勩亜閹板墎鎮肩紒鐘靛仦閵囧嫰濮€閳藉懓鈧潡鏌熼鐣屾噰闁瑰磭濞€椤㈡牜鎹勯妸锔芥瘞闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾剧懓顪冪€ｎ亝鎹ｉ柣顓炴閵嗘帒顫濋敐鍛婵°倗濮烽崑鐐烘偋閻樻眹鈧線寮撮姀鈩冩珕闂佽姤锚椤︻垱绔熼幒鎴旀斀闁绘﹩鍠栭悘杈ㄧ箾婢跺娲撮柟宕囧枛椤㈡稑顭ㄩ崟闈涗缓闂備線娼ч悧鍡涘箖閼愁垬浜归柟鐑樻尭娴滃綊鎮楅悷鏉款棌闁哥姵鐗犲畷婊勫鐎涙ǚ鎷虹紓鍌欑劍钃遍悘蹇庡嵆閺屻劑寮村Ο铏逛紙閻庢鍠栭…鐑藉箖閵忋倕宸濆┑鐘插鑲栭梻鍌欑閹诧繝骞愰崱娑樺窛妞ゆ梻鐡旈崯鍛存⒒閸屾艾鈧悂宕愭搴ｇ焼濞达絽鎽滈弳锔姐亜閹哄棗浜鹃柣鎾卞€濋弻銊╁籍閸屾矮澹曢悗瑙勬礀瀵墎鎹㈠┑瀣棃婵炴垵宕崜鍗烆渻閵堝啫鍔氶柣妤€锕﹂幑銏犫槈閵忕姷顓洪梺缁樺姇閻忔岸宕宠缁辨挻鎷呴悷鏉款潔缂備礁顑嗙敮鐐哄箲閵忕姭妲堟慨姗堢到娴滅偓绻涢幋鐐垫噽闁绘帊绮欓弻锝夘敇濠婂啠鍋撻弴銏＄畳婵犵數濮撮敃銈囪姳閼测晞濮崇紓浣骨滄禍婊勩亜閹扳晛鐏紒鐘茬－缁辨帗娼忛妸銉х懆闁句紮缍侀幃褰掑炊瑜庨埢鏇㈡煃瑜滈崜姘跺箰閸撗勵潟闁规儳鐡ㄦ刊鎾煕閿旇骞愭俊鎻掔墕椤啴濡堕崱妤冧淮闂佺懓鍟块柊锝夊春閵忋倕绠婚悹鍥皺閻も偓闂備胶绮〃鍛存偋閸愵喖绠繛宸簼閳锋垿鏌涘☉姗堝姛缂傚倹宀搁弻娑欐償閵堝鎽甸梺缁橆殔闁帮絽顫忕紒妯诲闁惧繒鎳撶粭鈥愁渻閵堝啫濡兼俊顐ｇ洴瀹曟岸骞掗幘鏉戝妳闂佹剚鍘归崕鑽ょ礊娓氣偓閻涱噣宕堕浣镐罕闂佸壊鍋呯缓楣冨磻閹剧粯鍊婚柤鎭掑劚閳ь剛鏁诲濠氬醇閻旇　濮囬梺鐟板级閹倿寮婚敐澶嬫櫇闁逞屽墴閹囧箻閹颁焦缍庨梺鎯х箰濠€閬嶆儗濞嗘挻鐓欑紒瀣仢椤掋垽鏌熼悿顖欏惈缂佽鲸鎸荤粭鐔煎炊瑜庨悘鍫㈢磽娴ｅ壊妲归柟鍛婂▕瀹曟椽濮€閵堝懐顔掑┑鐑囩秵閸撴瑦绂嶅┑瀣拺闁告稑锕ゆ慨鈧梺鍝勫€风欢姘剁嵁韫囨拋娲敂閸涱亝瀚奸梻浣告啞缁嬫垿鏁冮妷褌鐒婇柟娈垮枟閸犳劙鏌℃径濠勪虎闁哄棛鍋熺槐鎺楀磼濮樻瘷銏ゆ煃鐟欏嫬鐏寸€规洖鐖奸崺锟犲礃閹勬珬闂傚倸鍊风粈渚€骞夐敓鐘冲仭闁靛鏁￠崶銊︾秶闁靛闄勯悵宄邦渻閵堝懐绠伴柣妤€锕幃鈥斥槈濡硶鍋撻幒鎴僵妞ゆ帊鐒﹂幃娆忊攽閻愬弶鍣圭紒澶屾暬楠炲牓濡搁敂鍓х槇闂佸憡娲﹂崢鑲╃箔閿涘嫮纾藉ù锝堫嚃濞堟﹢鏌涢悩宕囧⒌鐎规洘妞介崺鈧い鎺嶉檷娴滄粓鏌熼崫鍕棞濞存粍鍎抽—鍐Χ鎼粹€崇濠电偞绁撮弲鐘烘閻熸粎澧楃敮妤冣偓鐢靛У缁绘繈妫冨☉娆忓亶婵炲瓨绮嶇划鎾诲蓟閻旂厧绠氱憸宥夋嚋瑜版帗鐓熼煫鍥э攻濞呭洭鏌ｉ妷顔婚偗妤犵偛妫滈ˇ鎶芥煕鐎ｃ劌鍔滈柟渚垮妽缁绘繈宕橀埞澶歌檸婵＄偑鍊戦崹娲€冩繝鍥ф槬闁逞屽墯閵囧嫰骞掗幋婵冨亾婵犳碍鍎楁繛鍡樻尰閻撴洟鏌￠崶銉ュ妤犵偞顭囩槐鎺楀焵椤掍胶绡€闁搞儯鍔庨崢鎼佹倵楠炲灝鍔氬Δ鐘虫倐閻涱喖螖閸涱喚鍘介梺瑙勫劤椤曨參骞婇崶顒佺厸閻忕偛澧藉ú瀛橆殽閻愮柕顏囩亙闂侀€炲苯澧存鐐诧攻閹棃鏁愰崶鈺冩殽闂備浇娉曢崰鎾存叏閻㈢鐓曢柟杈鹃檮閻撴瑩鏌熼娑欑凡鐞氭岸姊烘潪鎵獢濞存粌鐖奸獮鍐╃鐎ｅ灚鏅┑鐐村灦钃遍悹鍥╁仜閳规垿鎮╅顫濠电偞鎸婚崺鍐磻閹惧瓨鍙忓┑鐘插暞閵囨繃顨ラ悙鏉戝闁诡垱妫冮弫鎰板炊閳哄倹顔撻梻鍌氬€烽懗鍫曞箠閹捐鐤柛褎顨嗛悡鈧梺鎸庣箓閻楀﹪鏁嶉崒鐐粹拻濠电姴楠告禍婊勭箾鐠囇冾洭缂侇喗鐟╅獮鎺懳旀担闀愮暗闂備礁鎼ú銊╁窗閹版澘鐭楅煫鍥ㄦ⒐閸欏繑淇婇妶鍌氫壕濠碘槅鍋呴〃濠囨偘椤斿槈鏃€鎷呴崗鍝ョ泿闂備線娼чˇ顓㈠磿閾忣偅娅犻柨鏇炲€归悡娑氣偓鍏夊亾閻庯綆鍓涢敍鐔哥箾鐎电顎撳┑鈥虫川閸掓帒鈻庨幘鍐茬€銈嗘椤鈧氨鍠栧铏规嫚閺屻儺鈧鏌ｈ箛鏃囧妞ゎ厼鐏濊灒閻忓繑鐗曟禍鐐叏濡厧甯舵鐐达耿閺岀喖鐛崹顔句患闂佸疇顫夐崹褰掑焵椤掑﹦绉靛ù婊呭仱钘濋柡澶嬵儥濞撳鏌曢崼婵囧櫧缂佺姷澧楃换娑氭嫚瑜忛悾鍨亜閵忊剝灏摶鏍煃瑜滈崜鐔煎春閻愬搫绠ｉ柨鏃囧Г濞呮牠姊洪崨濠冨闁稿鍊垮鍫曨敇閵忊檧鎷虹紓浣割儐椤戞瑩鎮炴ィ鍐╃厱濠电姴鍟扮粻鎾绘煟閿濆懎妲绘い顓滃姂瀹曟﹢鏁愰崱娆屽亾婵犳碍鈷戦柛锔诲幖娴滅偓绻涢崗鑲╂噭缂佸倸绉归弻鍡楊吋閸″繑瀚肩紓鍌欑贰閸ㄥ崬煤閺嶃劍娅犻柤纰卞墰绾惧ジ鎮楅敐搴濈敖濠⒀嶇畵閺屾盯鍩為幆褌澹曞┑锛勫亼閸婃牜鏁繝鍥ㄥ€块柨鏇炰紪婢舵劕閱囬柍鍨涙櫅娴滈箖鎮峰▎蹇擃仾缂佲偓閸愵喗鐓ラ柡鍥悘鏌ユ煏閸℃洜顦﹂柍璇查叄楠炴﹢宕橀懠顒€鎼告繝鐢靛О閸ㄥジ顢氶弽顓炲瀭闁哄锛曞ú顏呮櫇闁稿本绋戞禍妤呮⒑閸濆嫭鍌ㄩ柛銊︽そ瀹曟劙宕奸弴鐔哄幗闂佸綊鍋婇崢鑲╁緤婵犳碍鐓冮梺鍨儐椤ュ牓鏌＄仦鐣屝фい銏＄☉閳藉鈻庨幋顓熜ч梻鍌欑閹碱偊鎯屾径灞界筏濞寸姴顑呴悡姗€鏌熸潏鍓х暠闁绘劕锕ラ妵鍕敇閻旈浠稿銈冨劚閻楀﹦鎹㈠┑鍡忔灁闁割煈鍠楅悘鍫ユ⒑閹稿孩纾搁柛搴ㄤ憾閳ユ棃宕橀钘夌檮婵犮垹鍘滈弲婊堟儎椤栨氨鏆︽慨妞诲亾濠碘剝鎮傛慨鈧柍钘夋缂嶅苯鈹戦悩鎰佸晱闁哥姵顨婇弫鍐煛閸涱厾顦梺鎸庢礀閸婂摜鐥閺岀喖姊荤€电濡介梺鎶芥敱鐢帡婀侀梺鎸庣箓濞层劑骞楅崒鐐寸厱闁靛牆鎳庨弳锝夋煛鐏炲墽娲撮柟顔规櫅閻ｇ兘宕惰閹蜂即鏌ｆ惔銈庢綈婵炲弶锕㈠畷婵嗏枎閹捐泛绁﹂梺鍝勭Р閸斿酣鎮疯ぐ鎺撶厱闁靛绲芥俊鑺ョ箾閸涱喗顥堟慨濠勭帛閹峰懘鎮烽柇锕€娈濈紓鍌欐祰椤曆囧磹閼愁垱顥ゅ┑鐐差嚟婵挳顢栭崨鏉戝嚑濞撴埃鍋撻柡灞剧洴楠炲洭妫冨☉娆戜憾闂備胶绮幐鍫曞磿閻㈢钃熼柨鐔哄Т閻愬﹥銇勯鐔风仸闁伙綀鍩栫换娑氣偓娑欘焽閻﹤顭胯閺咁偄危閹版澘绠婚悗娑櫭鎾绘⒑閸涘﹦绠撻悗姘嚇閺佹劙宕堕埡鍐跨床闂佽鍑界紞鍡涘磻閸曨個褰掝敊鐏忔牗鏂€闂佹寧绋戠€氼參寮抽鍌楀亾鐟欏嫭绀堥柛鐘崇墵閵嗕礁鈽夊鍡樺兊濡炪倖宸婚崑鎾绘煛娴ｉ潧鈧繂顫忕紒妯肩懝闁逞屽墮椤洩顦堕柛锝呯秺濮婃椽宕ㄦ繝浣虹箒闂佹悶鍔嶆竟鍡涘极椤曗偓楠炴绱掑Ο閿嬪闂備胶顭堥張顒勬偡瑜旇棟闁挎洖鍊归悡娆戠棯閺夊灝鑸瑰ù婊€鍗抽幐濠傗攽閸犮垹缍婂畷妤呭礂閼测晝鈻忕紓鍌欒兌婵敻鎮ч悩璇茶摕婵炴垶鐭▽顏堟煙椤栧棗鍟惁鎾寸節閻㈤潧浠滈柛姘儔閹兾旈崘鈺佸簥濠电偞鍨堕敃鈺呭疮閸涱喓浜滈柡鍐ㄦ搐閸氬綊鏌ｉ埡浣割劉缂佺粯绋撴竟鏇犫偓锝庝簷濮规绻濋悽闈涗汗闁稿鎹囧娲传閸曨剚鎷遍梺鐑╂櫓閸ㄤ即顢氶敐澶婄妞ゆ柨妲堥埡鍛厪濠㈣泛鐗嗛崝瀛樼箾閼规澘鍚圭紒杈ㄦ崌瀹曟帒鈻庨幋婵嗩瀴闂備礁鎲″褰掓偋閻樿绠氶柛鏇ㄥ灱閺佸秵鎱ㄥΟ鍝勬倯缂傚秴閰ｅ娲箚瑜忕粻鐗堢節閳ь剟鏌嗗鍡楀壒濠电偛妫欓崝妤冪不妤ｅ啯鐓曢柍鈺佸幘椤忓牆绀夐柕鍫濐槹閻撴洟鏌熼悙顒佺稇闁崇粯娲橀幈銊︾節閸涱噮浠╃紓渚囧枟閻熴儵鍩㈡惔銊ョ畾鐟滃秵绔熼崟顖涒拻濞达絼璀﹂悞楣冩煥閺囨ê鍔氶悡銈夋煟閺冨倸甯剁紒鐘崇墪铻栭柨婵嗘噹閺嗙偤鏌涙繝鍌ょ吋闁哄矉绠戣灒濞撴凹鍨辩瑧闁诲氦顫夐幐绋课涘┑鍡╂綎婵炲樊浜濋ˉ鍫熺箾閹寸偞鐨戦柣锝夌畺濮婃椽宕崟顒€娅ょ紓渚囧枟閹告悂顢氶敐澶婄闁圭儤绻勯崣鍡涙⒑閸撴彃浜為柛鐔锋健楠炲繐煤椤忓應鎷洪梺鍛婄☉閿曘儳浜搁幍顔藉枑闁哄鐏濋弳鐐电磼閸屾氨效闁诡喗鐟╅幃婊兾熼悡搴＄疄闂傚倷鑳剁划顖毼涢崘顔肩哗闂侇剙绉寸壕濠氭煏婢舵稑鐦滄繛鍫滅矙閺岋綁骞囬姘辨缂備胶濮寸壕顓犳閹烘挻缍囬柕濞垮劤閻熴劑鏌ф导娆戠М闁哄被鍊曢湁閻庯綆鍋呴悵锕傛⒑閸濄儱鏋庨梺甯到椤繐煤椤忓嫪绱堕梺鍛婃礀閻忔氨鐟ч梻鍌欒兌缁垶銆冮崨顓囨稑鈻庨幘宕囨煣闂佺厧鎽滈弫鎼併€呴悜鑺ュ€甸柨婵嗙凹缁ㄨ姤銇勯敂璇蹭簼缂佺粯绋撻埀顒傛暩椤牏鏁崼鏇熺厽閹烘娊宕濋幋锕€绠栭柍銉︽灱閺嬪酣鏌熼悙顒佺稇濞寸媭鍨跺娲箹閻愭彃濮庡┑鐐茬湴閸婃繈鐛繝鍥х疀闁绘鐗嗛崜銊╂⒑閸撴彃浜栭柛搴㈢叀瀹曟劙鎮介崨濠備画濠电偛妫楃换鎰邦敂椤忓嫷鐔嗛悹鍝勬惈椤忣參鏌＄仦鍓ф创濠碘剝鎮傛俊鐤槻闁绘挾鍠庤灃闁绘﹢娼ф禒婊堟煕閻曚礁浜伴柛鈹垮灪閹棃濡搁妷褜鍟嬮梻浣告惈椤︿即宕归悢鐓庣；闁规儳澧庣壕鍏间繆椤栨碍璐＄紒鐘宠壘椤啴濡堕崱娆忣潷缂備浇顕ч崯瀛樹繆閹绢喖绀冩い蹇撴閿涙繈姊虹粙鎸庢拱缂佸甯炴禍鎼佸级婢瑰啿閰ｅ畷鎯邦檪闂婎剦鍓熼弻鐔碱敊閻ｅ本鍣板銈冨灪濡啫鐣烽悢鐓幬╅柕澶堝€曢ˉ姘舵⒒娴ｅ憡鎯堢紒瀣╃窔瀹曘垺绂掔€ｎ亞锛涢柣搴秵閸嬪倻鎹㈤崱娑欑厪闁割偅绻冮崳褰掓煛閸℃鎳囬柡灞剧洴婵℃悂鏁傞崜褏鏉介梻浣筋嚃閸犳鏁冮姀銈呯畺婵炲棙鎸哥粻鐢告煙閸濆嫭顥為悗鍨墬娣囧﹪鎮欓鍕ㄥ亾閹版澘鐤炬繝闈涱儏缁€鍌涙叏濡炶浜鹃悗娈垮枛椤攱淇婇幖浣哥厸濞达綀顕栧Λ鐔兼⒒娴ｇ顥忛柣鎾崇墦瀹曚即骞掑Δ鈧粻浼存煕閹板吀绨界痪鎯с偢閺岋綁骞囬棃娑橆潻缂備讲鍋撻柛鎰靛枟閻撴洟鎮楅敐搴′簻濠殿喖顦版穱濠囧矗婢跺﹤顫掑Δ鐘靛仦椤洭鍩€椤掍胶鈯曢柨姘亜鎼淬垺宕岄柡宀嬬秮閹晠宕ｆ径灞诲亽缂傚倷娴囨ご绋棵洪悢椋庢殾婵犻潧妫涢弳瀣煙娴ｅ啯鐝柡鍌楀亾闂傚倷鑳剁划顖炲礉閺嶎兙浜归柛鎰典簽濡垳鎲搁弮鍫濊摕闁绘梻鍘у婵嗏攽閻樻彃鈧敻寮稿▎鎾村€垫繛鍫濈仢閺嬶附銇勯弴鍡楁搐閻撯€愁熆閼搁潧濮囨い顐㈡嚇閺岋絽顫滈埀顒€顭囪閻涱喚鈧綆鍠楅埛鎺懨归敐鍥╂憘闁搞倕鍟撮弻娑㈠Ω閵夆晛寮伴悗瑙勬礃鐢帡锝炲┑瀣缁炬媽椴搁敍鍛節閻㈤潧啸闁轰礁鎲￠幈銊╂倻婵劏鍋撻崒鐑嗘晩闁绘劦鍓﹀鐔兼⒑閸濆嫭鍌ㄩ柛銊ユ贡婢规洘绻濆顓犲幍闁哄鐗嗘晶浠嬫偩鏉堚晝妫柟顖嗗懐楔闂佸搫澶囬埀顒佸墯閸氬骞栫划鍏夊亾閼碱剙鍤梻鍌欑閹碱偄螞濞嗘垵鍨濈€光偓閸曨偆鍘撮梺纭呮彧闂勫嫰宕戦幇鐗堢厱婵炲棗娴氬Σ鍛娿亜閿旇娅婃慨濠冩そ楠炴牠鎮欏ù瀣壕闁哄洨濮崑鎾愁潩椤愩垹绁悗娈垮枦椤曆囧煡婢舵劕顫呴柣妯活問閸熷姊绘担钘夘棈濠㈢懓鐗嗛埢鏂库槈閵忕姴鍋嶉梺鏂ユ櫅閸熸壆绮绘ィ鍐╃厵閻庣數顭堟禒锕傛倶韫囷絽骞樼紒杈ㄥ笚瀵板嫬鐣濇繝鍐炬闂備浇顕х换鎰板疮閺夋埈娼栨繛宸簻缁犱即骞栨潏鍓ф偧闁伙絿鏁诲娲偡閺夋寧姣愰梻浣稿簻缁蹭粙顢氶敐澶婄闁兼亽鍎遍埀顒傚厴閺岋綁骞嬮悜鍡欏姺闂佸憡眉缁瑥顫忛搹瑙勫枂闁告洦鍋勬慨銏ゆ⒑鐎癸附婢樻俊璺ㄧ磼椤旇偐澧︾€规洘锕㈤、鏃堝幢濞嗘瑧搴婄紓鍌氬€搁崐鐑芥倿閿曞倵鈧箓宕堕‖陇娅ｉ埀顒佺⊕閿曗晛鈻撴禒瀣厽闁归偊鍓氶埢鏇㈡煕鎼达紕绠婚柡灞界Ф閹叉挳宕熼銈勭礉闁诲氦顫夊ú鏍х暦椤掑嫸缍栨繝闈涱儛閺佸棝鏌涚仦鎹愬缂佺媴缍佸濠氬磼濞嗘劗銈板銈嗘肠閸涱亜浜炬繛鎴炲笚濞呭﹥銇勯姀锛勬噰鐎殿喕绮欓、姗€鎮欓悜姗堢船濠碉紕鍋戦崐鏍哄澶婄；闁规儳鐏堥崑鎾舵喆閸曨剛顦ㄦ繝鐢靛仜閿曨亜顕ｉ锕€绠涙い鎾跺仧缁愮偞绻濋悽闈浶㈤柟鍐茬箻楠炲鎮ч崼銏㈢槇闂佹眹鍨藉褎绂掗敃鍌涚厱闁靛绠戦崝鍓佹喐閻楀牏鐭掓慨濠冩そ瀹曨偊宕熼棃娑樺闂傚倷绀佹惔婊呯礊娓氣偓楠炲啴鏁撻悪鈧弫鍐煥閺囨浜鹃梺缁樺姇閿曨亪寮婚弴鐔虹瘈闊洦绋掗宥夋⒑缁嬪潡顎楅悗娑掓櫇閹广垹鈽夐姀鐘甸獓闂佺懓顕慨鐢告儌娓氣偓濮婅櫣绮欏▎鎯у壉闂佸湱鎳撳ú銈夛綖韫囨梻绡€婵﹩鍓涢敍婊冣攽閻愬弶顥為柛銊ョ秺閹即濮€閵堝棌鎷洪梻渚囧亞閸嬫盯鎳熼娑欐珷濞寸厧鐡ㄩ悡鏇㈡倵閿濆骸浜炴繛鍙夋尦閺岀喎鐣烽崶褎鐏堝銈冨灪缁嬫垿鍩ユ径濞炬瀻闁归偊鍠栨繛鍥⒒閸屾瑧顦﹂柟璇х節閹兘濡烽埞褍娲、姗€鎮㈡笟顖涢敜婵犵數濮撮敃銈団偓姘ュ妽缁傚秴顭ㄩ崼鐔哄幍闂侀€涚祷濞呮洖鈻嶉崨瀛樼厽闁圭儤鏌ㄩ崝瀣庨崶褝韬€规洩绲惧鍕偓锝庝簴閸嬫捇骞囬悧鍫㈠幍濡炪倖娲栧Λ娑氬姬閳ь剚绻濆鏋€曢悡鎰偓鍨緲鐎氼喗绂掗敃鍌涘癄濠㈣泛鑻閬嶆⒒閸屾艾鈧兘鎮為敃鍌氱畺闁割偅娲栫壕鎸庛亜閺嶎偄浠滅紒鈧径鎰婵烇綆鍓欐俊濂告煟閹绢垪鍋撻幇浣哄數闁荤娀缂氬▍锝夋倶鏉堛劋绻嗘い鎰靛亜閻忥箓鏌″畝鈧崰鏍€佸☉銏犲耿婵°倐鍋撴い蹇婃櫅闇夐柣妯挎珪鐏忥附鎱ㄦ繝鍐┿仢鐎规洦鍋婂畷鐔碱敇閻樻彃蝎缂傚倸鍊峰ù鍥ㄣ仈缁嬫５鍝勎熼懖鈺冪効闂佸湱鍎ら〃鍡涘疾濠婂牊鐓熼柟浼存涧婢ь噣鏌ｅ┑鍛祮婵﹥妞藉畷鐑筋敇閻樿尙顐奸梺姹囧焺閸ㄨ京鏁敓鐘虫櫜闁绘劕鎼粻濠氭煕閹捐尪鍏岄柨娑欑箞濮婅櫣绮欓幐搴㈡嫳闂佽崵鍠嗛崝鎴濈暦濡ゅ啩娌悷娆欑稻閺傗偓婵＄偑鍊栧ú宥夊磻閹惧绠惧ù锝呭暱濞诧箓宕戦埡鍌滅瘈闂傚牊渚楅崕蹇曠磼閻樺灚鍤€闂囧鏌ㄥ┑鍡橆棤闁硅棄鍟撮弻鐔兼嚍閵夛妇顦板┑顔硷龚濞咃綁骞戦崟顖毼╅柕澶涘娴滄牕鈹戦悩鎰佸晱闁哥姵鐗犻、姘额敇閻樻彃鐏婇梺鍓插亖閸庤京绮堥崘鈹夸簻闁哄啫鍊瑰▍鏇㈡煕濮楀棔绨肩紒缁樼箞閹粙妫冨☉鎺戜壕妞ゆ牜鍋涚粈鍐煏婵犲繐顩ù婊堢畺濮婄粯鎷呴崨濠冨創濠碘槅鍋掗崣鍐ㄧ暦閹达箑宸濇い鏃堟暜閺€铏節閻㈤潧孝婵炶绠撳畷鎰版煥鐎ｃ劋绨婚棅顐㈡处閹告悂顢旈妶澶嬬厱閻庯綆鍋呭畷灞解攽闄囬崺鏍ь嚗閸曨剛绡€闁告洖澧庨獮銏ゆ⒒閸屾瑧顦﹂柟娴嬧偓瓒佹椽鏁冮崒姘€梺瑙勵問閸犳碍绋夊澶嬬厽婵☆垱瀵ч悵顏堟煕濞嗗繒绠插ǎ鍥э躬閹瑦锛愬┑鍡橆唲濠电偛鐡ㄧ划鎾剁不閺嶎厼绠栨俊銈傚亾闁崇粯鎹囧畷褰掝敊閻ｅ奔绮氬┑锛勫亼閸婃牕鈻旈敃鍌氱倞闁肩鐏氬▍宥夋⒒娴ｄ警鐒剧紒缁樺浮瀹曘垼顦存繛鍡愬灲閹瑩鎮滃Ο琛″亾閻㈠憡鐓ユ繝闈涙閸戝湱绱掗妸銊バ撳ǎ鍥э功缁辨帡濮€閻樺磭浜梻浣哥枃椤宕归崸妤€绠栭柍鍝勬媼閺佸﹪鏌ゅù瀣珒缂佽鲸蓱缁绘繈鎮介棃娑楃捕濡炪倧缂氶崡鎶藉箚閸曨垼鏁嶉柣鎰典簴閸嬫挻绗熼埀顒€顕ｆ禒瀣垫晣闁绘劘灏欓悰鈺備繆閻愵亜鈧牠骞愰懡銈囩煓闁圭儤顨嗛崐璺好归敐鍥┿€婇柡鈧禒瀣闁规儼妫勭壕褰掓煛閸ャ儱鐏╃紒鐘靛█閻擃偊宕堕妸褉妲堥梺缁樻尰濞茬喖寮婚悢琛″亾閻㈡鐒鹃崯鍝ョ磼閻愵剙绀冩俊顐㈠濠€渚€姊洪幐搴ｇ畵闁绘绮撳畷鐢稿礃椤旂晫鍘介梺鐟版惈缁夊爼鎯屽▎鎾寸厸閻忕偟鏅晥濡炪們鍨虹粙鎴﹀煡婢跺ň鏋庨柟鎼幗鑲栫紓鍌氬€搁崐宄懊归崶銊ｄ粓闁告縿鍎查弳婊堟煥閻斿搫袨闁逞屽厸缁€渚€鍩㈡惔銊ョ闁哄鍨堕悾浼存⒒娴ｅ摜鏋冩い鏇熺墵瀹曟鈻庨幘宕囷紮濠电娀娼ч鍛存嫅閻斿吋鐓熼柡鍐ㄦ搐娴滃湱鈧鎸风欢姘跺蓟濞戔懇鈧箓骞嬪┑鍥╀壕濠电偛顕慨鎾Χ缁嬫娼栭柧蹇撳帨閸嬫捇宕烽鐑嗏偓灞剧箾閸忕厧濮嶉柡灞剧洴婵℃悂濡疯妤旈梻浣虹《閺備線宕戦幘鎰佹富闁靛牆妫楃粭鎺楁煥閺囶亜顩紒顔芥閹粙宕ㄦ繝鍕箞闂佽鍑界紞鍡樼濠婂牜鏁傛い蹇撴绾惧ジ鏌涚仦鍓р槈缂佹甯￠幃锟犲Χ閸℃劒绨婚棅顐㈡处閹稿宕抽幎鑺ョ厵鐎瑰嫰鍋婇悡鍏兼叏婵犲懏顏犵紒顔界懇楠炴劖鎯旈姀鈥愁伆濠电姵顔栭崰妤勫綘闂佸憡鏌ㄧ粔鐟邦嚕閼碱剚宕夐悶娑掑墲椤秴鈹戦绛嬬劸濞存粠鍓熼弫宥咁煥閸喓鍘介柟鍏兼儗閸ㄥ磭绮旈悽鍛婄厱閻庯綆浜滈顏堟煙娓氬灝濡界€垫澘瀚伴獮鍥敇閻樻彃绠為梻鍌欑濠€閬嶅磿閵堝绠伴柛婵勫劤缁犳梻鎲搁弮鍫濊摕闁绘柨鍚嬮崑锟犳煛婢跺鍎ュù鐘插⒔缁辨挻鎷呯拠鈩冪暭闂佸摜濮甸悧鐘诲Υ娴ｇ硶妲堟俊顖炴敱椤秴鈹戦埥鍡楃仩闁告艾顑堥。楣冩⒒閸屾艾鈧悂宕愰幖浣哥９濡炲瀛╅鑺ユ叏濮楀棗澧婚柣鎺旀櫕閹叉悂寮崼婵堢暫閻熸粍鏌ㄩ悾鐑藉础閻愨晜鐎婚梺褰掑亰閸撴瑧鑺遍妷锔剧瘈缁剧増蓱椤﹪鏌涢…鎴濈仯闁瑰嘲鍟撮弫鍐磼濞戞ǚ鍋撻悽鍛婄厾闁告縿鍎辨禒顖毭瑰鍕煉闁哄矉绻濆畷姗€濡搁妷銏犱壕闁荤喐澹嬮弸宥夋煛閸モ晛啸缁炬儳銈搁弻宥夋煥椤栨矮澹曢梻浣侯焾椤戝棝骞戦崶褜娼栫紓浣诡焽閻熷綊鏌嶈閸撴瑩鈥﹂崶顏嶆Ь闂佺懓绠嶉崹钘夌暦閸楃儐娓绘い顐枤缁夘喚鈧娲忛崝搴ㄥ焵椤掍胶鈯曢柨姘舵煃瑜滈崜娆撴倶濠靛绠掗梻浣虹帛閿氭俊顖氾躬瀹曟洟骞囬悧鍫㈠幗闂佽鍎抽悺銊х矆閸愵亞纾肩紓浣诡焽濞插鈧娲栧畷顒冪亙闂佸憡鍔︽禍鍫曞船瑜版帗鈷掑〒姘ｅ亾婵炶壈宕靛濠囨偩瀹€鈧粈濠傗攽閻樺弶鎼愰柦鍐枔閳ь剙绠嶉崕鍗灻洪敃鍌氱獥闁糕剝绋掗悡鏇㈡煛閸ャ儱濡煎ù婊呭仜闇夐柣鎾虫捣閻掑憡鎱ㄦ繝鍛仩闁告牗鐗犲鎾偄閸涘﹦缈婚梻鍌欒兌椤牓鏌婇敐鍜佺劷鐟滄棃骞冩ィ鍐╁€婚柦妯侯槺椤㈠懘姊虹紒妯哄缂佸娼ц灋闁告劑鍔庨弳锔戒繆椤栨侗鍎ユ俊鑼帶閳规垿鍩ラ崱妤冧哗闂佹寧娲︽禍婊堬綖韫囨稒鎯為悷娆忓閻濅即姊洪崨濠勬噧妞わ富鍨跺銊╊敇閻戝棙瀵岄梺闈涚墕妤犲憡绂嶅鍕╀簻闁挎棁顕ч悘锝夋煕濞嗗繑鍣归柍瑙勫灴閹晝鎷犺娴兼劙姊虹紒姗嗘當婵☆偅绻傞锝夊川婵犲啫顎撶紓渚囧灡濞叉﹢寮埀顒勬⒒娴ｈ櫣甯涢柨姘舵煟閵堝懏澶勭紒鏃傚枎铻ｇ紓浣姑煎锕€鈹戦悩缁樻锭妞ゆ垵妫濋崺娑㈠箣閿旂晫鍘卞┑鐐村灦閿曨偊宕濋悢鍏肩厓闁芥ê顦藉Ο鈧梺鍝勭焿缁查箖鐛繝鍥ㄧ厱闁哄啠鍋撻柛銊ユ健閻涱噣宕橀鑺ユ闂佺粯锚瀵剟濡搁埡鍌滃帗闂佸憡绻傜€氼剟鍩€椤掍焦鍊愰柛鈹惧亾濡炪倖甯掗崐褰掑汲椤掑嫭鐓涢悘鐐额嚙婵″ジ鏌嶇憴鍕伌鐎规洖宕灃濞达綀顕栭崬鍙夌節閻㈤潧孝闁汇儱顦垫俊鍫曞幢閳衡偓閸濇绱撻崒娆愮グ濡炴潙鎽滈弫顕€鍩勯崘褏绠氶梺褰掓？缁€浣告暜婵＄偑鍊栧褰掑磿閹惰棄绠栭柟瀵稿仧缁♀偓濠电偛鐗嗛悘婵嬪几濞戙垺鐓ラ柡鍥崝姘亜椤忓嫬鏆ｉ柟绋匡攻瀵板嫮浠﹂悙顒夊晭濠碉紕鍋戦崐鏍礉瑜忕划濠氬箣閻樼數鐒奸柣搴秵閸嬩焦绂嶅鍫熺厵闁哄鐏濋。宕囩磼鐎ｎ剛甯涢柕鍥у瀵剟宕归鍛棯缂傚倷鑳剁划顖滄崲閸儱绠栧ù鐘差儐椤ュ牊绻涢幋鐑嗘當闁硅棄顑嗘穱濠囨倷椤忓嫧鍋撻弽顬″搫螣閻撳骸鐏婇柟鑹版彧缁蹭粙宕瑰┑鍡忔斀闁绘ê鐤囨竟妯肩磼閻樺樊鐓奸柟顔煎槻閳诲氦绠涢幙鍐х触缂傚倷娴囨ご鎼佸箰閼姐倖宕叉繝闈涱儐閸嬨劑姊婚崼鐔峰瀬闁绘劗鍎ら悡鏇㈡煏婵炑冨暙娴犳﹢姊哄畷鍥╁笡闁哄被鍔戦崺銉﹀緞閹邦剦娼婇梺鐐藉劚閸熸寧绔熸惔銊︹拻濞达絿顭堥幃鎴犵磼娴ｈ灏︾€殿喗褰冮埥澶愬煑閸濆嫷妲告い顐ｇ箞椤㈡牠鎳為妷锔芥緫闂傚倷鑳堕…鍫ュ嫉椤掑倸鏋堢€广儱顦悿顕€鏌ｉ幇顔煎妺闁绘挾鍠栭弻鐔煎箚瑜忛幗鐘电磼閳ь剛鈧綆鍠楅悡娑氣偓鍏夊亾闁逞屽墴瀹曚即寮介鐘茬ウ闂佺鎻粻鎴犵不濞戞瑣浜滈柟鐑樺灥閳ь剙缍婇、姘旀担椋庣畾闂佺粯鍔︽禍婊堝焵椤戭剙鎳忔刊濂告煥濠靛棙宸濆☉鎾崇Ч閺岀喐娼忔ィ鍐╊€嶇紓浣哄У鐢€愁潖缂佹ɑ濯撮柧蹇曟嚀缁楋繝鏌﹂崘顔绘喚闁哄矉缍侀幃銏ゅ级閹存繂顫撻梺缁樻尪閸婃繈寮婚妸鈺佸嵆闁绘劖绁撮崑鎾广亹閹烘垹锛涢梺绋跨灱閸嬬偤鎮￠弴銏＄厵闁哄鐏濋幃浣虹磼閵娿儯鍋㈤柡灞剧洴閹晠宕橀幓鎺濇綌缂傚倷鑳剁划顖滄崲閸愵亝宕叉繝闈涱儏绾惧吋绻濇繝鍌氭灓闁哄棭鍋嗙槐鎾诲磼濞嗘帩鍞归梺绋款儐閹瑰洭寮诲☉銏╂晝闁靛牆鎳忛悘浣虹磽娴ｅ搫鈻堢紒鐘崇墵瀵鈽夐姀鐘靛姶闂佺绻掓刊顓熺椤忓牆绠栨慨妞诲亾闁糕斁鍓濋幏鍛村矗婢舵ɑ缍岄梻鍌欐祰椤宕曞畷鍥ь棜妞ゆ挴鈧枼鍋撻幘顔解拻濞撴埃鍋撻柍褜鍓涢崑娑㈡嚐椤栨稒娅犳い鏂垮⒔绾惧ジ鏌ｅΟ鍨毢閺佸牓鎮楃憴鍕婵炶尙鍠栧濠氬幢濡ゅ啯娈奸梺闈涱槶閸庢煡宕板Ο姹囦簻闁靛骏绱曢埥澶嬨亜椤撴粌濮傜€规洘锕㈤幃娆擃敆婢跺绱栭梻鍌氬€搁崐鐑芥嚄閸洩缍栭悗锝庡枛缁€瀣煕椤垵浜為柡鍡畵濮婄粯鎷呴悷鎵虫灆闂佽　鍋撻梺顒€绉撮崹鍌炴煕椤愶絾绀€濡楀懘姊洪崨濠冨闁搞劍澹嗙划濠氬箮閼恒儳鍘遍梺鏂ユ櫅閸熴劍绂掗敃鈧…璺ㄦ喆閸曨剛顦紓浣介哺閹瑰洤鐣烽幒鎴旀瀻闁规惌鍘借ⅵ濠碉紕鍋戦崐褏绱撳璺虹闁瑰墎鏅畵渚€鏌熼悧鍫熺凡缂佺媭鍣ｉ弻锕€螣娓氼垱楔闂佷紮绲惧钘夘潖閾忓湱鐭撻柛鈩冾殔椤忓瓨绻涢崼娑樼伈闁哄备鍓濋幏鍛村礈閹绘帒澹庨梻浣告惈閼活垳绮旈悜閾般劍绗熼埀顒勫蓟濞戙垹绠婚悹铏瑰劋閻庤顪冮妶鍡樼┛缂佹彃澧介幑銏犫攽閸♀晜鍍靛銈嗘尵閸犳劙鎮甸幎鑺モ拻濞达絽鎲￠崯鐐电磼鐎ｎ偄鐏寸€规洘鍔栫换婵嗩潩椤掑倻宕堕梺鐟板悑閻ｎ亪宕濆畝鍕亗婵犻潧顑呯粻瑙勭箾閿濆骸澧┑陇鍋愮槐鎺楁偐閾忣偆娈ら梺瑙勫絻閹诧繝骞嗛弮鍫氣偓锕傚箣閻愬瓨鐝﹂梻鍌欑閹测€趁洪敃鍌氬偍闁告挆鍐炬?);
    if (!ok) return;
    try {
      await fetchJson(`/api/recordings/${encodeURIComponent(rid)}`, { method: 'DELETE' });
      if (selectedTourRecordingIdRef.current === rid) {
        setSelectedTourRecordingId('');
      }
    } catch (e) {
      alert(String((e && e.message) || e || 'delete_failed'));
    }
    await refreshTourRecordings();
  };
  */

  const clearExhibitChatSessions = async () => {
    const confirmed = window.confirm('\u786e\u8ba4\u5220\u9664\u201c\u5c55\u5385\u804a\u5929\u201d\u7684\u6240\u6709 session \u5417\uff1f');
    if (!confirmed) return;
    try {
      const res = await fetchJson('/api/ragflow/chats/clear_sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_name: '\u5c55\u5385\u804a\u5929' }),
      });
      const deleted = Number((res && res.deleted) || 0);
      alert(`${deleted} \u4e2a session \u5df2\u5220\u9664`);
    } catch (e) {
      alert(String((e && e.message) || e || 'clear_chat_sessions_failed'));
    }
  };

  const { interruptCurrentRun, askQuestion } = useAskWorkflowManager({
    baseUrl: backendBase,
    getIsLoading: () => isLoading,
    requestSeqRef,
    interruptManagerRef,
    askAbortRef,
    activeAskRequestIdRef,
    cancelBackendRequest,
    emitClientEvent: (evt) => emitClientEventExt({ ...(evt || {}), clientId: clientIdRef.current }),
    clientIdRef,
    debugRef,
    beginDebugRun,
    debugMark,
    setLastQuestion,
    setAnswer,
    setAnswerCacheMeta,
    setQaCacheDebug,
    setIsLoading,
    setQueueStatus,
    onRagflowUnavailable: markRagflowUnavailable,
    setTourState,
    setCurrentIntent,
    receivedSegmentsRef,
    ttsEnabledRef,
    ttsManagerRef,
    getTtsManager,
    abortPrefetch,
    tourPipelineRef,
    getTourPipeline,
    tourStateRef,
    tourResumeRef,
    getTourStopName,
    startStatusMonitor,
    guideEnabledRef,
    guideDurationRef,
    guideStyleRef,
    qaAnswerTargetCharsRef,
    qaAudioCacheLookupEnabledRef,
    qaAudioCacheConfidenceThresholdRef,
    audienceProfileRef,
    useAgentModeRef,
    selectedChatRef,
    selectedAgentIdRef,
    tourStopDurationsRef,
    tourStopTargetCharsRef,
    getTourStops: () => (tourStopsRef.current || []),
    tourRecordingEnabledRef,
    playTourRecordingEnabledRef,
    selectedTourRecordingIdRef,
    activeTourRecordingIdRef,
    finishTourRecordingArchive,
    currentAudioRef,
    getHistorySort: () => historySort,
    fetchHistory,
    runCoordinatorRef,
    globalPromptPrefixRef,
    voiceConversationTurnsRef,
    voiceConversationContextStrategyRef: asrConversationContextStrategyRef,
    voiceConversationContextRecentTurnsRef: asrConversationContextRecentTurnsRef,
    voiceConversationContextMaxTokensRef: asrConversationContextMaxTokensRef,
    consumePendingAsrClientEvents: () => {
      const items = Array.isArray(pendingAsrClientEventsRef.current) ? [...pendingAsrClientEventsRef.current].reverse() : [];
      pendingAsrClientEventsRef.current = [];
      return items;
    },
  });

  const {
    getRunCoordinator,
    submitUserText,
    startTour,
    continueTour,
    prevTourStop,
    nextTourStop,
    jumpTourStop,
    resetTour,
    onAnswerQueuedNow,
    onRemoveQueuedQuestion,
    onInterruptManual,
  } = useRunOrchestration({
    tourControllerRef,
    runCoordinatorRef,
    tourControllerDeps: {
      ttsEnabledRef,
      audioContextRef,
      preferredTtsSampleRate: PREFERRED_TTS_SAMPLE_RATE,
      unlockAudio,
      fetchJson,
      tourZoneRef,
      audienceProfileRef,
      guideDurationRef,
      tourMetaRef,
      setTourStops,
      setTourStopDurations,
      setTourStopTargetChars,
      tourStopDurationsRef,
      tourStopTargetCharsRef,
      continuousTourRef,
      tourRecordingEnabledRef,
      playTourRecordingEnabledRef,
      selectedTourRecordingIdRef,
      setPlayTourRecordingEnabled,
      setSelectedTourRecordingId,
      activeTourRecordingIdRef,
      tourTemplateIdRef,
      tourStopsOverrideRef,
      tourStopDurationsOverrideRef,
      interruptManagerRef,
      startTourRecordingArchive,
      loadTourRecordingMeta,
      tourStateRef,
      tourResumeRef,
      getTtsManager,
      getTourStops: () => (tourStopsRef.current || []),
      buildTourPrompt,
      beginDebugRun,
      askQuestion,
      getTourPipeline,
      interruptCurrentRun,
      onRagflowUnavailable: markRagflowUnavailable,
      useAgentModeRef,
      selectedChatRef,
      setTourState,
      getTourStopName,
      setAnswer,
    },
    runCoordinatorDeps: {
      interruptCurrentRun,
      askQuestion,
      preprocessVoiceText,
      getIsLoading: () => isLoading,
      ttsEnabledRef,
      audioContextRef,
      unlockAudio,
      beginDebugRun,
      setInputText,
      askAbortRef,
      currentAudioRef,
      ttsManagerRef,
      queueRef,
      setQuestionQueue,
      lastSpeakerRef,
      groupModeRef,
      tourPipelineRef,
      guideEnabledRef,
      clientIdRef,
      setQueueStatus,
      getTourStops: () => (tourStopsRef.current || []),
      parseTourCommand: ({ clientId, text, stops }) => parseTourCommand({ clientId, text, stops }),
    },
  });

  const isRunActiveForBargeIn = () => {
    const askActive = !!(askAbortRef && askAbortRef.current);
    const loading = !!isLoading;
    const audioActive = !!(currentAudioRef && currentAudioRef.current);
    const ttsBusy = !!(ttsManagerRef && ttsManagerRef.current && ttsManagerRef.current.isBusy && ttsManagerRef.current.isBusy());
    const pipelineActive =
      !!(tourPipelineRef && tourPipelineRef.current && tourPipelineRef.current.isActive && tourPipelineRef.current.isActive());
    return askActive || loading || audioActive || ttsBusy || pipelineActive;
  };

  const canAutoResumeTour = () => {
    const state = tourStateRef && tourStateRef.current ? tourStateRef.current : null;
    if (!state) return false;
    if (String(state.mode || '') === 'idle') return false;
    return Number.isFinite(Number(state.stopIndex)) && Number(state.stopIndex) >= 0;
  };

  const shouldAutoResumeTour = () => {
    if (!canAutoResumeTour()) return false;
    const state = tourStateRef && tourStateRef.current ? tourStateRef.current : null;
    const runningMode = String((state && state.mode) || '') === 'running';
    return runningMode || isRunActiveForBargeIn();
  };

  const isAsrBusyForResume = () => {
    const lastChangeAt = Number(lastAsrInputChangeAtRef.current || 0);
    if (!Number.isFinite(lastChangeAt) || lastChangeAt <= 0) return false;
    return Date.now() - lastChangeAt < 700;
  };

  const {
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
  } = useVoiceConversationControls({
    asrProviderType,
    baseUrl: backendBase,
    minRecordMs: asrMinRecordMs,
    asrStopGraceMs,
    asrFinalWaitMs,
    asrFinalTimeoutStrategy,
    clientIdRef,
    setInputText: setInputTextFromAsr,
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
    onAsrFinalText: handleAsrFinalText,
    setQueueStatus,
    inputText,
    groupMode,
    speakerName,
    questionPriority,
    useAgentMode,
    selectedAgentId,
    continueTour,
    autoBargeInSubmitEnabled: asrAutoSubmitOnWakeEnabled,
    autoSubmitSilenceMs: asrConversationAutoSubmitSilenceMs,
    autoSubmitScope: asrConversationAutoSubmitScope,
    autoResumeAfterQaEnabled: asrAutoResumeAfterAnswerEnabled,
    shouldAutoResumeTour,
    canAutoResumeTour,
    isRunActive: isRunActiveForBargeIn,
    isAsrBusyForResume,
    autoResumeTourAfterQaMs: asrAutoResumeAfterAnswerDelayMs,
  });

  const stagePanelProps = useStagePanelProps({
    clientIdRef,
    stageSpeedMode,
    setStageSpeedMode,
    setGuideDuration,
    setQueueStatus,
    interruptCurrentRun,
    continueTour,
    nextTourStop,
    resetTour,
    startTour,
  });

  useEffect(() => {
    const text = String(inputText || '').trim();
    const pendingAsrText = String(pendingAsrFinalTextRef.current || '').trim();
    const asrActive =
      !!isRecognizing ||
      recognitionStage === 'receiving_partial' ||
      recognitionStage === 'awaiting_final' ||
      recognitionStage === 'final_received' ||
      recognitionStage === 'streaming' ||
      recognitionStage === 'wake_detected';
    if (!asrActive) return () => {};
    if (!text || !pendingAsrText || text !== pendingAsrText) return () => {};
    if (!asrTextFilterEnabled) return () => {};
    const prompt = String(asrTextFilterPrompt || '').trim();
    const chatName = String(asrTextFilterChatName || '').trim();
    if (!prompt || !chatName) return () => {};
    const pipeline = asrPostProcessPipelineRef.current;
    if (!pipeline || typeof pipeline.prefetchFilter !== 'function') return () => {};

    const seq = Number(asrPrefetchSeqRef.current || 0) + 1;
    asrPrefetchSeqRef.current = seq;
    try {
      if (asrPrefetchTimerRef.current) window.clearTimeout(asrPrefetchTimerRef.current);
    } catch (_) {
      // ignore
    }
    asrPrefetchTimerRef.current = window.setTimeout(() => {
      asrPrefetchTimerRef.current = null;
      if (asrPrefetchSeqRef.current !== seq) return;
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
    }, 120);

    return () => {
      try {
        if (asrPrefetchTimerRef.current) window.clearTimeout(asrPrefetchTimerRef.current);
      } catch (_) {
        // ignore
      }
      asrPrefetchTimerRef.current = null;
    };
  }, [
    inputText,
    isRecognizing,
    recognitionStage,
    asrTextFilterEnabled,
    asrTextFilterPrompt,
    asrTextFilterChatName,
    asrTextFilterTerms,
    wakeWordEnabled,
    wakeWord,
  ]);

  useEffect(() => {
    return () => {
      try {
        if (wakeWordStatusTimerRef.current) window.clearTimeout(wakeWordStatusTimerRef.current);
      } catch (_) {
        // ignore
      }
      wakeWordStatusTimerRef.current = null;
      try {
        if (asrPrefetchTimerRef.current) window.clearTimeout(asrPrefetchTimerRef.current);
      } catch (_) {
        // ignore
      }
      asrPrefetchTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    try {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (_) {
      // ignore
    }
  }, [lastQuestion, answer, isLoading, queueStatus]);

  useEffect(() => {
    if (!tourRecordingEnabled || !playTourRecordingEnabled) return;
    setTourRecordingEnabled(false);
  }, [playTourRecordingEnabled, setTourRecordingEnabled, tourRecordingEnabled]);

  useEffect(() => {
    if (!tourRecordingOptionsReady || !playTourRecordingEnabled) return;
    const options = Array.isArray(tourRecordingOptions) ? tourRecordingOptions : [];
    const rid = String(selectedTourRecordingId || '').trim();
    const exists = !!rid && options.some((item) => String((item && item.recording_id) || '').trim() === rid);
    if (exists) return;
    const fallbackRid = String((options[0] && options[0].recording_id) || '').trim();
    if (fallbackRid) {
      if (fallbackRid !== rid) setSelectedTourRecordingId(fallbackRid);
      return;
    }
    setPlayTourRecordingEnabled(false);
    if (rid) setSelectedTourRecordingId('');
  }, [
    playTourRecordingEnabled,
    selectedTourRecordingId,
    setPlayTourRecordingEnabled,
    setSelectedTourRecordingId,
    tourRecordingOptions,
    tourRecordingOptionsReady,
  ]);

  const wasTourActiveRef = useRef(false);
  useEffect(() => {
    const active =
      !!isLoading ||
      !!(askAbortRef && askAbortRef.current) ||
      !!(currentAudioRef && currentAudioRef.current) ||
      !!(ttsManagerRef && ttsManagerRef.current && ttsManagerRef.current.isBusy && ttsManagerRef.current.isBusy()) ||
      String((tourState && tourState.mode) || '') === 'running';
    const prev = !!wasTourActiveRef.current;
    if (!prev && active) {
      setTourButtonState((s) => reduceTourButtonState(s, { type: 'PLAYBACK_STARTED' }));
    } else if (prev && !active) {
      setTourButtonState((s) => reduceTourButtonState(s, { type: 'PLAYBACK_STOPPED' }));
    }
    wasTourActiveRef.current = active;
  }, [isLoading, tourState, askAbortRef, currentAudioRef, ttsManagerRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    if (uiViewMode !== 'simple') {
      setSimpleTtsPlaying(false);
      return () => {};
    }

    const timer = window.setInterval(() => {
      const playing = !!(currentAudioRef && currentAudioRef.current);
      setSimpleTtsPlaying((prev) => (prev === playing ? prev : playing));
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, [uiViewMode, currentAudioRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(UI_VIEW_MODE_STORAGE_KEY, normalizeUiViewMode(uiViewMode));
    } catch (_) {
      // ignore
    }
  }, [uiViewMode]);

  const ragflowUnavailable = ragflowConnection && ragflowConnection.connected === false;
  const ragflowStatusLabel =
    ragflowConnection && ragflowConnection.connected === false
      ? '\u672a\u8fde\u63a5'
      : ragflowConnection && ragflowConnection.connected === true
        ? '\u5df2\u8fde\u63a5'
        : '\u68c0\u6d4b\u4e2d';
  const ragflowStatusTone =
    ragflowConnection && ragflowConnection.connected === false
      ? 'status-error'
      : ragflowConnection && ragflowConnection.connected === true
        ? 'status-ok'
        : '';
  const resolveCurrentRagflowConversationName = useCallback(() => {
    if (ragflowUnavailable || useAgentMode) return '';
    return String((selectedChatRef && selectedChatRef.current) || selectedChat || '').trim();
  }, [ragflowUnavailable, selectedChat, selectedChatRef, useAgentMode]);

  const resolveTourRagflowConversationName = useCallback(() => {
    const currentName = resolveCurrentRagflowConversationName();
    const names = Array.isArray(chatOptions) ? chatOptions.map((name) => String(name || '').trim()).filter(Boolean) : [];
    if (names.includes(TOUR_RAGFLOW_CHAT_NAME)) return TOUR_RAGFLOW_CHAT_NAME;
    if (currentName) return currentName;
    return TOUR_RAGFLOW_CHAT_NAME;
  }, [chatOptions, resolveCurrentRagflowConversationName]);

  const prepareTourRagflowConversation = useCallback(() => {
    const nextName = resolveTourRagflowConversationName();
    if (!nextName) return '';
    if (selectedChatRef) selectedChatRef.current = nextName;
    setSelectedChat(nextName);
    setActiveRagflowConversationName(nextName);
    return nextName;
  }, [resolveTourRagflowConversationName, selectedChatRef, setSelectedChat]);

  const rawSelectedChatName = String((selectedChatRef && selectedChatRef.current) || selectedChat || '').trim();
  const currentRagflowConversationName = String(resolveCurrentRagflowConversationName() || '').trim();
  const ragflowConversationLabel = useAgentMode
    ? 'Agent妯″紡'
    : String(activeRagflowConversationName || currentRagflowConversationName || rawSelectedChatName || '鏈€夋嫨').trim();
  const submitDisabled = isRecording || !String(inputText || '').trim() || (useAgentMode && !selectedAgentId) || ragflowUnavailable;
  const interruptDisabled =
    !isLoading && !((ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) || currentAudioRef.current);
  const tourToggleLabel =
    tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT
      ? '\u6253\u65ad'
      : tourButtonState.mode === TOUR_BTN_MODE.CONTINUE
        ? '\u7ee7\u7eed\u8bb2\u89e3'
        : '\u5f00\u59cb\u8bb2\u89e3';
  const tourToggleDanger = tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT;
  const tourToggleDisabled = tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT ? interruptDisabled : ragflowUnavailable;
  const sendMode = playTourRecordingEnabled ? 'playback' : tourRecordingEnabled ? 'recording' : 'normal';
  const sendBtnClassName = `submit-btn submit-btn-${sendMode}`;

  const onTourToggle = async () => {
    if (tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT) {
      onInterruptManual();
      setTourButtonState((s) => reduceTourButtonState(s, { type: 'INTERRUPT_CLICK' }));
      return;
    }
    if (tourButtonState.mode === TOUR_BTN_MODE.CONTINUE) {
      setTourButtonState((s) => reduceTourButtonState(s, { type: 'CONTINUE_CLICK' }));
      try {
        setActiveRagflowConversationName((prev) => prev || resolveCurrentRagflowConversationName());
        await continueTour();
        markRagflowAvailable();
      } catch (error) {
        markRagflowUnavailable({ source: 'tour_continue', error });
        setTourButtonState((s) => ({ ...(s || {}), mode: TOUR_BTN_MODE.CONTINUE }));
      }
      return;
    }
    setTourButtonState((s) => reduceTourButtonState(s, { type: 'START_CLICK' }));
    try {
      prepareTourRagflowConversation();
      await startTour();
      markRagflowAvailable();
    } catch (error) {
      markRagflowUnavailable({ source: 'tour_start', error });
      setTourButtonState({ started: false, mode: TOUR_BTN_MODE.START });
    }
  };

  const onResetAll = async () => {
    try {
      onInterruptManual();
    } catch (_) {
      // ignore
    }
    try {
      await resetTour();
    } catch (_) {
      // ignore
    }
    if (queueRef) queueRef.current = [];
    if (voiceConversationTurnsRef) voiceConversationTurnsRef.current = [];
    if (activeAskRequestIdRef) activeAskRequestIdRef.current = null;
    if (askAbortRef) askAbortRef.current = null;
    setActiveRagflowConversationName('');
    try {
      if (ttsManagerRef && ttsManagerRef.current) ttsManagerRef.current.stop('reset_all');
    } catch (_) {
      // ignore
    }
    if (currentAudioRef) currentAudioRef.current = null;
    setTourButtonState((s) => reduceTourButtonState(s, { type: 'RESET' }));
    wasTourActiveRef.current = false;
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
  };

  const openFullUi = () => setUiViewMode('full');
  const openSimpleUi = () => setUiViewMode('simple');
  const simpleTourRunning = !!(tourButtonState && tourButtonState.started);
  const onSimpleTourToggle = async () => {
    if (simpleTourRunning) {
      await onResetAll();
      return;
    }
    setTourButtonState((s) => reduceTourButtonState(s, { type: 'START_CLICK' }));
    try {
      prepareTourRagflowConversation();
      await startTour();
      markRagflowAvailable();
    } catch (error) {
      markRagflowUnavailable({ source: 'simple_tour_start', error });
      setTourButtonState({ started: false, mode: TOUR_BTN_MODE.START });
    }
  };

  useEffect(() => {
    if (ragflowUnavailable || useAgentMode) {
      setActiveRagflowConversationName('');
    }
  }, [ragflowUnavailable, useAgentMode]);

  const controlBarProps = useControlBarProps({
    useAgentMode,
    setUseAgentMode,
    agentOptions,
    selectedAgentId,
    setSelectedAgentId,
    chatOptions,
    selectedChat,
    setSelectedChat,
    guideEnabled,
    setGuideEnabled,
    guideDuration,
    setGuideDuration,
    guideStyle,
    setGuideStyle,
    qaAnswerTargetChars,
    setQaAnswerTargetChars,
    qaAudioCacheLookupEnabled,
    setQaAudioCacheLookupEnabled,
    qaAudioCacheConfidenceThreshold,
    setQaAudioCacheConfidenceThreshold,
    tourMeta,
    tourZone,
    setTourZone,
    audienceProfile,
    setAudienceProfile,
    groupMode,
    setGroupMode,
    ttsEnabled,
    setTtsEnabled,
    ttsMode,
    setTtsMode,
    ttsSpeed,
    setTtsSpeed,
    continuousTour,
    setContinuousTour,
    tourRecordingEnabled,
    setTourRecordingEnabled,
    playTourRecordingEnabled,
    setPlayTourRecordingEnabled,
    tourRecordingOptions,
    selectedTourRecordingId,
    setSelectedTourRecordingId,
    renameSelectedTourRecording,
    deleteSelectedTourRecording,
    wakeWordEnabled,
    setWakeWordEnabled,
    wakeWord,
    setWakeWord,
    wakeWordCooldownMs,
    setWakeWordCooldownMs,
    wakeWordStrict,
    setWakeWordStrict,
    asrAutoSubmitOnWakeEnabled,
    setAsrAutoSubmitOnWakeEnabled,
    asrAutoResumeAfterAnswerEnabled,
    setAsrAutoResumeAfterAnswerEnabled,
    asrAutoResumeAfterAnswerDelayMs,
    setAsrAutoResumeAfterAnswerDelayMs,
    asrConversationAutoSubmitSilenceMs,
    setAsrConversationAutoSubmitSilenceMs,
    asrConversationAutoSubmitScope,
    setAsrConversationAutoSubmitScope,
    asrConversationContextStrategy,
    setAsrConversationContextStrategy,
    asrConversationContextRecentTurns,
    setAsrConversationContextRecentTurns,
    asrConversationContextMaxTokens,
    setAsrConversationContextMaxTokens,
    tourState,
    currentIntent,
    tourStops,
    tourStopsOverride,
    tourStopDurations,
    tourStopDurationsOverride,
    setTourStopDurationsOverride,
    tourStopPromptOverrides,
    setTourStopPromptOverrides,
    tourStopDurationTemplateKey,
    setTourStopDurationTemplateKey,
    tourStopDurationTemplates,
    setTourStopDurationTemplates,
    tourSelectedStopIndex,
    setTourSelectedStopIndex,
    jumpTourStop,
    resetTour,
    globalPromptPrefix,
    setGlobalPromptPrefix,
    asrTextFilterEnabled,
    setAsrTextFilterEnabled,
    asrTextFilterChatName,
    setAsrTextFilterChatName,
    asrTextFilterTerms,
    setAsrTextFilterTerms,
    asrTextFilterPrompt,
    setAsrTextFilterPrompt,
    asrMinRecordMs,
    setAsrMinRecordMs,
    asrStopGraceMs,
    setAsrStopGraceMs,
    asrFinalWaitMs,
    setAsrFinalWaitMs,
    asrProviderType,
    setAsrProviderType,
    asrFinalTimeoutStrategy,
    setAsrFinalTimeoutStrategy,
    saucWsUrl,
    setSaucWsUrl,
    saucResourceId,
    setSaucResourceId,
    saucAppKey,
    setSaucAppKey,
    saucAccessKey,
    setSaucAccessKey,
    saucModelName,
    setSaucModelName,
    saucSegmentDurationMs,
    setSaucSegmentDurationMs,
    saucEnableItn,
    setSaucEnableItn,
    saucEnablePunc,
    setSaucEnablePunc,
    saucEnableDdc,
    setSaucEnableDdc,
    saucShowUtterances,
    setSaucShowUtterances,
    saucEnableNonstream,
    setSaucEnableNonstream,
    asrRecognitionStage: recognitionStage,
    asrPostProcessStage,
    asrPostProcessEvents,
  });

  const tourModePanelProps = useTourModePanelProps({
    tourGuideTemplates,
    setTourGuideTemplates,
    tourGuideTemplateId,
    setTourGuideTemplateId,
    tourStops,
    setTourStopsOverride,
    setTourStopDurationsOverride,
  });

  const { onPickHistoryQuestion, onQuickSummary, onChangeHistorySort } = useUiActions({
    inputElRef,
    setInputText,
    submitTextAuto,
    setHistorySort
  });

  const { textInputProps } = useTextInputProps({
    isRecording,
    isRecognizing,
    recognitionStage,
    pointerSupported: POINTER_SUPPORTED,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
    startRecording,
    stopRecording,
    conversationEnabled,
    conversationBusy,
    onToggleConversation,
    inputElRef,
    inputText,
    setInputText,
    sendBtnClassName,
    submitDisabled
  });

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const bridge = window.__RAGINT_E2E__;
    if (!bridge || typeof bridge !== 'object') return () => {};

    const prevSetGroupMode = bridge.setGroupMode;
    const prevSetQuestionPriority = bridge.setQuestionPriority;
    const prevSetUseAgentMode = bridge.setUseAgentMode;
    const prevSetSelectedAgentId = bridge.setSelectedAgentId;
    const prevGetUiState = bridge.getUiState;

    const setGroupModeForTest = (value) => {
      const next = !!value;
      setGroupMode(next);
      return next;
    };
    const setQuestionPriorityForTest = (value) => {
      const next = String(value || '').trim() === 'high' ? 'high' : 'normal';
      setQuestionPriority(next);
      return next;
    };
    const setUseAgentModeForTest = (value) => {
      const next = !!value;
      setUseAgentMode(next);
      return next;
    };
    const setSelectedAgentIdForTest = (value) => {
      const next = String(value || '').trim();
      setSelectedAgentId(next);
      return next;
    };
    const getUiState = () => ({
      groupMode: !!groupMode,
      questionPriority: String(questionPriority || 'normal'),
      useAgentMode: !!useAgentMode,
      selectedAgentId: String(selectedAgentId || ''),
    });

    bridge.setGroupMode = setGroupModeForTest;
    bridge.setQuestionPriority = setQuestionPriorityForTest;
    bridge.setUseAgentMode = setUseAgentModeForTest;
    bridge.setSelectedAgentId = setSelectedAgentIdForTest;
    bridge.getUiState = getUiState;

    return () => {
      if (bridge.setGroupMode === setGroupModeForTest) {
        if (typeof prevSetGroupMode === 'function') bridge.setGroupMode = prevSetGroupMode;
        else delete bridge.setGroupMode;
      }
      if (bridge.setQuestionPriority === setQuestionPriorityForTest) {
        if (typeof prevSetQuestionPriority === 'function') bridge.setQuestionPriority = prevSetQuestionPriority;
        else delete bridge.setQuestionPriority;
      }
      if (bridge.setUseAgentMode === setUseAgentModeForTest) {
        if (typeof prevSetUseAgentMode === 'function') bridge.setUseAgentMode = prevSetUseAgentMode;
        else delete bridge.setUseAgentMode;
      }
      if (bridge.setSelectedAgentId === setSelectedAgentIdForTest) {
        if (typeof prevSetSelectedAgentId === 'function') bridge.setSelectedAgentId = prevSetSelectedAgentId;
        else delete bridge.setSelectedAgentId;
      }
      if (bridge.getUiState === getUiState) {
        if (typeof prevGetUiState === 'function') bridge.getUiState = prevGetUiState;
        else delete bridge.getUiState;
      }
    };
  }, [groupMode, questionPriority, selectedAgentId, setGroupMode, setQuestionPriority, setSelectedAgentId, setUseAgentMode, useAgentMode]);

  const guideTemplateList = Array.isArray(tourGuideTemplates) ? tourGuideTemplates : [];
  const selectedGuideTemplate =
    guideTemplateList.find((tpl) => String((tpl && tpl.id) || '').trim() === String(tourGuideTemplateId || '').trim()) ||
    guideTemplateList[0] ||
    null;
  const guideTemplateOptions = guideTemplateList.length
    ? guideTemplateList.map((tpl) => ({
        value: String((tpl && tpl.id) || ''),
        label: String((tpl && (tpl.name || tpl.id)) || '\u6a21\u677f'),
      }))
    : [{ value: '', label: '\u6682\u65e0\u6a21\u677f' }];
  const templateOrderedStops =
    selectedGuideTemplate && Array.isArray(selectedGuideTemplate.stops)
      ? selectedGuideTemplate.stops
          .filter((row) => row && row.enabled !== false)
          .map((row) => String((row && row.name) || '').trim())
          .filter(Boolean)
      : [];

  let currentModeLabel = '\u5b9e\u65f6\u8bb2\u89e3';
  if (playTourRecordingEnabled) currentModeLabel = '\u64ad\u653e\u5b58\u6863';
  else if (tourRecordingEnabled) currentModeLabel = '\u5f55\u5236\u8bb2\u89e3';
  const currentModeValue = playTourRecordingEnabled ? 'playback' : tourRecordingEnabled ? 'recording' : 'realtime';
  const modeOptions = [
    { value: 'realtime', label: '\u5b9e\u65f6\u8bb2\u89e3' },
    { value: 'recording', label: '\u5f55\u5236\u8bb2\u89e3' },
    { value: 'playback', label: '\u64ad\u653e\u5b58\u6863' },
  ];
  const audienceProfileOptions = (tourMeta && Array.isArray(tourMeta.profiles) ? tourMeta.profiles : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => ({ value: item, label: item }));
  const speedOptions = [
    { value: '1', label: '\u6807\u51c6(1.0x)' },
    { value: '1.25', label: '\u52a0\u5feb(1.25x)' },
    { value: '1.5', label: '\u66f4\u5feb(1.5x)' },
  ];

  const currentStopIndexFromState =
    tourState && Number.isFinite(tourState.stopIndex) && Number(tourState.stopIndex) >= 0
      ? Number(tourState.stopIndex)
      : -1;
  const stopList = Array.isArray(tourStops) ? tourStops : [];
  const fallbackStopName =
    currentStopIndexFromState >= 0 && currentStopIndexFromState < stopList.length
      ? String(stopList[currentStopIndexFromState] || '').trim()
      : '';
  const runtimeStopName = String((tourState && tourState.stopName) || fallbackStopName || '').trim();
  const templateStopNameByIndex =
    currentStopIndexFromState >= 0 && currentStopIndexFromState < templateOrderedStops.length
      ? String(templateOrderedStops[currentStopIndexFromState] || '').trim()
      : '';
  const currentStopName = templateStopNameByIndex || runtimeStopName;
  let displayStopIndex = currentStopIndexFromState;
  if (currentStopName && templateOrderedStops.length) {
    const idxInTemplate = templateOrderedStops.findIndex((name) => String(name || '').trim() === currentStopName);
    if (idxInTemplate >= 0) displayStopIndex = idxInTemplate;
  }
  const currentStopLabel =
    displayStopIndex >= 0
      ? `\u7b2c${displayStopIndex + 1}\u7ad9${currentStopName ? ` ${currentStopName}` : ''}`
      : '\u672a\u5f00\u59cb';
  const wakeWordLabel = wakeWordEnabled ? String(wakeWord || '').trim() || '\u672a\u8bbe\u7f6e' : '\u672a\u542f\u7528';
  const audienceProfileLabel = String(audienceProfile || '').trim() || '\u672a\u8bbe\u7f6e';

  if (uiViewMode === 'simple') {
    return (
      <div className="app">
        <div className="container simple-tour-container">
          <SimpleTourControlPage
            isRunning={simpleTourRunning}
            showWave={simpleTtsPlaying}
            onToggle={onSimpleTourToggle}
            onOpenMainPage={openFullUi}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <HomeStatusBar
          modeValue={currentModeValue}
          modeOptions={modeOptions}
          onChangeMode={(value) => {
            const nextMode = String(value || '').trim();
            if (nextMode === 'playback') {
              setTourRecordingEnabled(false);
              setPlayTourRecordingEnabled(true);
              return;
            }
            if (nextMode === 'recording') {
              setPlayTourRecordingEnabled(false);
              setTourRecordingEnabled(true);
              return;
            }
            setPlayTourRecordingEnabled(false);
            setTourRecordingEnabled(false);
          }}
          speedValue={String(ttsSpeed || 1)}
          speedOptions={speedOptions}
          onChangeSpeed={(value) => setTtsSpeed(Number(value) || 1.0)}
          templateValue={selectedGuideTemplate ? String(selectedGuideTemplate.id || '') : ''}
          templateOptions={guideTemplateOptions}
          onChangeTemplate={(value) => setTourGuideTemplateId(String(value || '').trim())}
          audienceProfileValue={audienceProfileLabel}
          audienceProfileOptions={audienceProfileOptions}
          onChangeAudienceProfile={(value) => setAudienceProfile(String(value || '').trim())}
          ragflowStatusLabel={ragflowStatusLabel}
          ragflowStatusTone={ragflowStatusTone}
          ragflowConversationLabel={ragflowConversationLabel}
          wakeWordLabel={wakeWordLabel}
          currentStopLabel={currentStopLabel}
        />

        <div className="workspace-shell">
          <div className="left-settings-pane">
            <SettingsPanel
              docked
              showHistoryPanel={showHistoryPanel}
              onChangeShowHistoryPanel={setShowHistoryPanel}
              showDebugPanel={showDebugPanel}
              onChangeShowDebugPanel={setShowDebugPanel}
              controlBarProps={controlBarProps}
              stagePanelProps={stagePanelProps}
              tourModePanelProps={tourModePanelProps}
              ttsMode={ttsMode}
              modelscopeVoice={modelscopeVoice}
              onChangeModelscopeVoice={setModelscopeVoice}
              ttsFetchConcurrency={ttsFetchConcurrency}
              onChangeTtsFetchConcurrency={setTtsFetchConcurrency}
              groupMode={groupMode}
              speakerName={speakerName}
              onChangeSpeakerName={setSpeakerName}
              questionPriority={questionPriority}
              onChangeQuestionPriority={setQuestionPriority}
              onQuickSummary={onQuickSummary}
              onPrevStop={prevTourStop}
              onNextStop={nextTourStop}
              onClearExhibitChatSessions={clearExhibitChatSessions}
              activeTab={settingsActiveTab}
              onChangeActiveTab={setSettingsActiveTab}
              ragflowStatusLabel={ragflowStatusLabel}
              ragflowStatusDetail={String((ragflowConnection && ragflowConnection.message) || '').trim()}
            />
          </div>

          <div className="center-pane">
            <MainLayout
              lastQuestion={lastQuestion}
              answer={answer}
              answerCacheMeta={answerCacheMeta}
              qaCacheDebug={qaCacheDebug}
              isLoading={isLoading}
              queueStatus={queueStatus}
              messagesEndRef={messagesEndRef}
            />
          </div>

          <div className="right-pane">
            <RightPanelTabs
              showHistoryPanel={showHistoryPanel}
              historySort={historySort}
              onChangeHistorySort={onChangeHistorySort}
              historyItems={historyItems}
              onPickHistoryQuestion={onPickHistoryQuestion}
              showDebugPanel={showDebugPanel}
              debugInfo={debugInfo}
              qaCacheDebug={qaCacheDebug}
              guideModeLabel={currentModeLabel}
              ttsEnabled={ttsEnabled}
              tourState={tourState}
              serverStatus={serverStatus}
              serverStatusErr={serverStatusErr}
              serverEvents={serverEvents}
              serverEventsErr={serverEventsErr}
              serverLastError={serverLastError}
              questionQueue={questionQueue}
              onAnswerQueuedNow={onAnswerQueuedNow}
              onRemoveQueuedQuestion={onRemoveQueuedQuestion}
            />
          </div>
        </div>

        <InputSection
          onBackToSimple={openSimpleUi}
          onTourToggle={onTourToggle}
          tourToggleLabel={tourToggleLabel}
          tourToggleDanger={tourToggleDanger}
          tourToggleDisabled={tourToggleDisabled}
          onReset={onResetAll}
          onSubmit={handleTextSubmit}
          textInputProps={textInputProps}
        />
      </div>
    </div>
  );
}

export default AppShell;


