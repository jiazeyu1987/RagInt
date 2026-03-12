import React, { useEffect, useState, useRef } from 'react';
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
  const [selectedChat, setSelectedChat] = useState('展厅聊天');
  const [agentOptions, setAgentOptions] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [useAgentMode, setUseAgentMode] = useState(false);
  const { options: tourRecordingOptions, refresh: refreshTourRecordingOptions } = useTourRecordingOptions({
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
    zones: ['默认路线'],
    profiles: ['大众', '儿童', '专业'],
    default_zone: '默认路线',
    default_profile: '大众',
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
        if (status === 'processing_asr_text') setQueueStatus('正在处理 ASR 文本...');
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
      if (result.feedback === 'wake_word_detected') showTransientQueueStatus('已检测到唤醒词');
      else if (result.feedback === 'wake_word_missing') showTransientQueueStatus('未检测到唤醒词');
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

  // TTS婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柛娑橈攻閸欏繘鏌ｉ幋锝嗩棄闁哄绶氶弻娑樷槈濮楀牊鏁鹃梺鍛婄懃缁绘﹢寮婚敐澶婄婵犲灚鍔栫紞妤呮⒑闁偛鑻晶顕€鏌涙繝鍌涘仴妤犵偞鍔栫换婵嬪礃椤忓棗楠勯梻浣稿暱閹碱偊顢栭崶鈺冪煋妞ゆ棃鏁崑鎾舵喆閸曨剛锛橀梺鍛婃⒐閸ㄧ敻顢氶敐澶婇唶闁哄洨鍋熼娲⒑缂佹鎳冮柟铏姍閻涱噣濮€閵堝棌鎷婚梺绋挎湰閻熝囁囬敃鍌涚厵婵炴潙顑呮晶鑼磼濡ゅ啫鏋庨摶鏍煕濞戝崬骞橀柣鎾村灴閺岀喖宕楅懖鈺傛闂佸憡鏌ㄧ粔鐟扮暦閹达箑绀嬫い鏍ㄧ〒閸橀亶姊洪弬銉︽珔闁告﹢绠栭幊鏍煛閸屾艾绨ラ梻浣虹《閸撴繆褰犳繛瀛樼矋缁捇寮婚垾鎰佸悑闁告劑鍔岄‖澶愭⒑濮瑰洤濡介柛銊ョ埣楠炲牓濡搁埡鍌涙珳闂佹悶鍎滈崒娑辨綗闂傚倷绀侀幖顐﹀嫉椤掑倻鐭欓柟鎹愵嚙閻掑灚銇勯幒鎴姛缂佸鏁婚弻娑氣偓锝庝簼閸ｈ棄霉濠婂嫭鍊愭い銏★耿閹垻绱欓悩鐢垫晨濠碉紕鍋戦崐鏍礉瑜忓濠勬崉閵娧傜瑝闂佺粯鍔楅崕銈夋偂濞嗘劑浜滈柡鍐ㄥ€归崵鈧繝鈷€鍕弨闁哄瞼鍠栭、娑樷槈濞嗘ɑ顥堝┑鐘愁問閸犳帡宕戦幘缁樷拺闂傚牊绋撶粻鍐测攽椤曗偓椤ユ挾鍒掗弮鍫熷仺闁告稑艌閹风粯绻涙潏鍓ф偧闁烩剝妫冨畷闈涒枎閹炬潙鈧灚绻涢幋鐐茬瑲婵炲懎锕ラ妵鍕閿涘嫭鍣伴悗娈垮枙缁瑩銆佸鈧幃娆撴倻濮楀牏鑸规繝纰夌磿閸嬫垿宕愰弽顬″搫顓兼径濠勶紱闂佽鍎抽悘鍫ュ磻閹捐埖鍠嗛柛鏇ㄥ墰椤︺劑姊洪幖鐐插濠⒀冮叄楠炴垿濮€閻橆偅鏂€闁诲函缍嗘禍鐐哄磹閻愮儤鈷戦悗鍦У閵嗗啴鏌ら崘鑼煟濠碘€崇埣閺佸倿鎮惧畝鈧惁鍫㈢磼閸撗冾暭閽冭鲸銇勯顫含闁哄本鐩俊鎼佸Χ閸涱厾銈柣搴ゎ潐濞插繘宕曢幎钘夌劦妞ゆ帒锕︾粔鐢告煕韫囨棑鑰跨€规洘鍨块獮姗€骞囨担鐟板厞婵＄偑鍊栭幐楣冨磻濞戙垹绠洪柣銏犳啞閳锋垿鏌涘┑鍡楊伂妞ゎ偓绠撻弻娑欑節閸愮偓鐤侀悗瑙勬礈婢ф鎹㈠┑瀣倞鐟滃繘銆侀崨瀛樷拺缂備焦锚婵牏绱掓担瑙勫唉妤犵偛绻戠换婵嗩潩椤撴稒瀚藉┑鐐舵彧缁蹭粙骞夐敓鐘茬柈闁绘劗鍎ら悡鐘垫喐閻楀牆绗ч柣锝囧劋椤ㄣ儵鎮欑拠褍浼愰柧浼欑到閵嗘帒顫濋悡搴ｄ画缂傚倸绉村ù椋庢閹捐纾兼繛鍡樺灥婵′粙鏌﹂崘銊ヨ埞闁宠鍨块、娑樷槈濞嗗繐鏀梻浣告惈閺堫剛绮欓幋锕€鐓″璺侯煬濞笺劑鏌涢鐘插姢闁告瑥绉剁槐鎾存媴妤︽寧顎楅梺鍛娚戦幃鍌氱暦閹达箑绠婚悗闈涙憸閻﹀牓姊哄Ч鍥х伈婵炰匠鍡忓彺闂傚倷鑳堕幊鎾诲床閺屻儱鐤柡澶嬪灩閺嗭箓鏌ｉ弮鍌氬付闁搞劌鍊归妵鍕箛閳轰讲鍋撻弽褉鏋旈柦妯侯槴閺€浠嬫煥濞戞ê顏╁ù婊冦偢閺屾稒绻涢崹顔瑰亾濠靛棛鏆﹂柕蹇ョ磿闂勫嫰鏌涘☉姗堝伐闁逞屽墲閸╂牜鎹㈠┑瀣棃婵炴垵鍟挎慨娑欑箾鐎涙鐭嗙紒顔界懃椤繒绱掑Ο璇差€撴繛鎾村嚬閸ㄦ娊宕濋崫銉х＝濞达綀娅ｇ敮娑㈡煕閺冣偓閻熴儵鎮鹃悜钘壩ㄧ憸澶愬磻閹剧粯鏅查幖瀛樼箘閹稿姊洪崫鍕靛剱闁哄被鍔戝﹢渚€姊虹紒妯诲碍婵炲鍏橀獮妤呮偐缂佹鍘辨繝鐢靛Т鐎氼參寮抽鍕厵妞ゆ梻鍘уΣ濠氭煃鐠囧弶鍞夌紒鐘崇洴楠炴瑩宕樿濡垳绱撻崒姘偓椋庢媼閺屻儱纾婚柟鍓х帛閻撳啰鎲稿鍫濈婵炲棙鎸搁悡姗€鏌熸潏楣冩闁稿﹦鍏橀弻銈囧枈閸楃偛顫梺鍛婃礋缁犳牕顫忓ú顏勫窛濠电姴鍟伴崣鍡涙煟鎼淬垻鈻撻柡鍛箘閸?
  const MAX_PRE_GENERATE_COUNT = 2; // 闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻鐔兼⒒鐎靛壊妲紒鐐劤缂嶅﹪寮婚悢鍏尖拻閻庨潧澹婂Σ顔剧磼閹冣挃闁硅櫕鎹囬垾鏃堝礃椤忎礁浜鹃柨婵嗙凹缁ㄥジ鏌熼惂鍝ョМ闁哄矉缍侀、姗€鎮欓幖顓燁棧闂備線娼уΛ娆戞暜閹烘缍栨繝闈涱儐閺呮煡鏌涘☉鍗炲妞ゃ儲鑹鹃埞鎴炲箠闁稿﹥顨嗛幈銊╂倻閽樺锛涢梺缁樺姉閸庛倝宕戠€ｎ喗鐓熸俊顖濆吹濠€浠嬫煃瑜滈崗娑氭濮橆剦鍤曢柟缁㈠枛椤懘鏌嶉埡浣告殲闁绘繃娲熷缁樻媴閽樺－鎾绘煥濮橆厹浜滈柨鏃囶嚙閺嬨倗绱掓潏銊︻棃鐎殿喗鎸虫慨鈧柍閿亾闁归绮换娑欐綇閸撗冨煂闂佺顕滅换婵嗙暦椤栫偞鍊烽柣鎴烆焽閸橀亶姊洪崫鍕殲闁规悂绠栭幃楣冩偨绾版ê浜鹃悷娆忓绾惧鏌涘Δ鈧崯鍧楊敋閿濆棛顩烽悗锝呯仛閺呮繈姊洪棃娑氱畾闁哄懏绮撹棢闁炽儲鏋奸弨浠嬫煟濡櫣浠涢柡鍡忔櫅閳规垿顢欓悙顒佹瘎闂佸摜濮撮敃銈夘敇閸忕厧绶為悗锝庝簷缁ㄥ灚绻濋悽闈涗粶婵☆偅鐟╅獮鎰節濮橆厼浜楅梺缁樻煥閸氬鎮″▎寰濆綊鎮℃惔锝嗘喖濠电偞鍤崘鍓у數閻熸粍绮撳畷浼村冀椤撴稈鍋撻敃鍌涘殑妞ゆ牭绲鹃鍥⒒娴ｈ鍋犻柛鏂跨焸閹儵鎮℃惔顔兼婵犵數濮电喊宥夊疾閹绘帩鐔嗛悹铏瑰皑閺€缁樸亜閵夛妇绠炴慨濠冩そ瀹曠兘顢樿閸旀悂鏌ｆ惔锛勪粵閻㈩垱甯熼悘瀣⒑閹稿孩绀€闁稿﹤缍婇崺娑㈠箣閿旂晫鍘卞┑鐘绘涧濡顢旈浣典簻妞ゆ劦鍓涢悾鐢告煛鐏炲墽鈯曠紒缁樼箞瀹曟﹢顢旈崱娆愭緰闂傚倷鑳剁划顖涚瑹濡ゅ懎闂柨婵嗘媼閸ゆ洖霉閻樺樊鍎忛幆鐔兼⒑閹稿孩纾甸柛瀣尰閵囧嫭鎯旈姀鈥崇３闂佸搫鐭夌紞渚€骞冮姀銈呬紶闁靛绠戝▍鎴︽⒑鐠囨彃顒㈤柣顓у櫍瀹曪繝宕樺顔兼濡炪倖鍔х€靛矂寮崒鐐寸厱妞ゆ劑鍊曢弳閬嶆煙妞嬪海甯涚紒缁樼⊕濞煎繘宕滆閸╁矂姊虹涵鍜佸殝缂佺粯绻傞悾鐑筋敍閻愭潙鈧兘鏌ｉ姀銏℃毄闁挎稒绮撻弻锝夋偐閸欏顦╅悷婊勬緲閸熸挳銆侀弮鍫晣闁绘﹩鍋勬禍楣冩偡濞嗗繐顏紒鈧崘鈺冪闁肩⒈鍓欓弸鎴澢庨崶褝韬柟铏矒濡啫鈽夊杈╁祦婵犵數濮烽弫鎼佸磿閹邦剦鐔嗗ù锝堟娑撳秹鏌熼幑鎰靛殭闁藉啰鍠愮换娑㈠箣濞嗗繒浠奸梺鍛婎殕婵炲﹪寮婚弴鐔虹闁割煈鍠栨慨銏＄箾鐎电顎岄柛娆忓暙椤繐煤椤忓嫪绱堕梺鍛婃处閸撴瑥鈻嶉妶澶嬧拺缂備焦蓱閹牏绱掔紒妯肩畵妞ゆ洩绲块幏鐘裁圭€ｎ偒娼旀繝娈垮枟閿曗晠宕戦崨鏉戠闁告劦鍠楅埛鎴︽煕濞戞﹫鏀婚悗鍨懇閺屽秷顧侀柛鎾村哺楠炲牓濡搁埡浣哄€炲銈嗗笂鐠佹煡骞忛搹鍦＝闁稿本鐟ч崝宥嗐亜椤撶偞宸濈紒顔碱煼瀵粙顢曢悢铚傚闂佺绻愰ˇ顖涚閸撗呯＝濞达絽澹婇崕鎰亜閹寸偟鎳冩い顓炴喘瀵粙顢橀悢鍝勫及闂傚鍋勫ú锕傚礄閻熼偊鐒介柟鎵閸婂灚鎱ㄥ鍡楀箹闁告繃妞介弻锛勪沪閻ｅ睗褍鈹戦敍鍕幋濠碘剝鎮傞弫鍌炲箚瑜庨柨顓㈡⒒閸屾瑦绁版い鏇嗗懏宕查柟閭﹀劦濞戞ǚ妲堟慨姗嗗弾濞肩喖姊虹憴鍕姢妞ゆ洦鍙冮幃鐤亹閹烘挾鍘遍梺闈涱槹閸ㄧ數鈧凹鍠楃粋宥夊醇閺囩啿鎷绘繛杈剧秬濡嫰宕ヨぐ鎺撶厱闁绘棃鏀遍崑銉р偓娈垮枟閻擄繝骞冮埡鍐＜婵☆垵妗ㄧ划褎淇婇悙顏勨偓鏍哄澶婄；闁规儳鐏堥崑鎾舵喆閸曨剛顦ㄩ梺鎸庢磸閸ㄤ粙濡存担绯曟瀻闁瑰瓨绻冮悗鎶芥煛婢跺﹦澧戦柛鏂挎捣缁棃鏌嗗鍡忔嫽闂佺鏈悷褏绮ｉ弮鈧换娑欐媴閸愬弶鍣虹€规洘鐓￠弻娑㈩敃閻樻彃濮庨梺鎼炲妼閸婃悂鍩為幋锔藉亹鐎规洖娴傞弳锟犳⒑缁嬫鍎忛柛濠傛健瀵鎮㈤悡搴ｎ槶閻熸粌绻掗弫顔尖槈閵忥紕鍘介梺瑙勫礃濞夋盯寮稿☉銏＄厸鐎光偓鐎ｎ剙鍩岄柧浼欑秮閺屾稑鈹戦崱妤婁患缂備焦顨忛崣鍐潖濞差亝鍋傞幖绮规濡本绻涚€涙鐭ゅù婊庝簻椤曪絿鎷犲ù瀣潔闂侀潧绻掓慨鐢杆夊┑鍡忔斀闁绘劕寮堕ˉ鐐烘煕鎼淬垹鈻曠€规洘绮嶇€佃偐鈧稒菤閹?濠电姷鏁告慨鐑藉极閸涘﹥鍙忛柣鎴ｆ閺嬩線鏌涘☉姗堟敾闁告瑥绻橀弻锝夊箣閿濆棭妫勯梺鍝勵儎缁舵岸寮诲☉妯锋婵鐗婇弫楣冩⒑閸涘﹦鎳冪紒缁橈耿瀵鏁愭径濠勵吅闂佹寧绻傚Λ顓炍涢崟顖涒拺闁告繂瀚烽崕搴ｇ磼閼搁潧鍝虹€殿喖顭烽幃銏ゅ礂鐏忔牗瀚介梺璇查叄濞佳勭珶婵犲伣锝夘敊閸撗咃紲闂佽鍨庨崘锝嗗瘱缂傚倷绶￠崳顕€宕归幎钘夌闁靛繒濮Σ鍫ユ煏韫囨洖啸妞ゆ挸鎼埞鎴︽倷閸欏妫炵紓浣虹帛鐢绮嬮幒鎾卞亝闁告劏鏂侀幏铏圭磽娴ｅ壊鍎愭い鎴炵懇瀹曟洝绠涢弬璁崇盎闂佺懓鐡ㄧ换宥呂熼埀顒勬⒑鐠団€虫珯缂佺粯绻堥妴渚€寮撮姀鈩冩珖闂侀€炲苯澧撮柟顔界懄缁绘繈宕堕妸褍甯惧┑鐘垫暩閸婎垶鍩€椤掑嫬纾婚柟鍓х節缁诲棝鏌熺紒妯虹濠⒀嶉檮閹便劍绻濋崘鈹夸虎閻庤娲﹂崑濠傜暦閻斿吋顥堟繛鎴灻ˉ瀣磽閸屾艾鈧鎷嬮弻銉ョ；闁瑰墽鍋ㄩ埀顒佸笒椤繈鏁愰崨顒€顥氶梻鍌欒兌绾爼寮插┑瀣；闁靛牆顦卞畵渚€鎮楅敐搴℃灍闁哄懏绮撻弻锕€螣娓氼垱啸濠殿喛顫夐〃濠囧蓟閿濆棙鍎熼柕鍫濆缂嶅牆鈹戦悙鎻掔骇闁绘娲熷﹢渚€姊虹粙璺ㄧ伇闁稿绋戞晥闁哄被鍎查悡銉╂煟閺傛寧鎯堥弽锟犳⒑閹惰姤鏁遍柛銊ユ贡濡叉劙骞掗弬鍝勪壕闁挎繂楠告禍浠嬫煕鎼存稑鍔﹂柡灞剧⊕閹棃鏁嶉崟顓у晪闂備礁鎼張顒傜矙閹烘梹宕叉繝闈涱儏绾惧吋绻涢幋鐏荤厧菐椤曗偓閺岋絾鎯旈姀鈺佹櫛闂佸摜濮甸悧鐘诲灳閿曞倹鐓ラ悗锝傛櫇缁犳岸姊洪崗鍏煎€愭繛浣冲懏顐介柣鎰ゴ閺€浠嬫煟濡法绨块柛蹇撶焸閺岋綁骞囬濠呭惈濠殿喖锕︾划顖滅箔閻旂厧鐒垫い鎺嗗亾妞ゎ厼娲╅ˇ褰掓寠濠靛枹褰掓偐瀹割喖鍓扮紓浣瑰姈椤ㄥ棙绌辨繝鍥ч柛灞剧煯婢规洟姊绘担鍝ワ紞缂侇噮鍨堕獮鎴﹀炊椤掑倸绁﹂悗骞垮劚椤︿粙寮繝鍥ㄧ厱闁圭偓顨呯粔鍫曟⒒?

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
    const next = window.prompt('闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻鐔兼⒒鐎靛壊妲紒鐐劤濠€閬嶅焵椤掑倹鍤€閻庢凹鍙冨畷宕囧鐎ｃ劋姹楅梺鍦劋閸ㄥ綊宕愰悙鐑樺仭婵犲﹤鍟扮粻鑽も偓娈垮枟婵炲﹪寮崘顔肩＜婵炴垶鑹鹃獮鍫熶繆閻愵亜鈧倝宕㈡禒瀣瀭闁割煈鍋嗛々鍙夌節闂堟侗鍎愰柣鎾存礃缁绘盯宕卞Δ鍐唺缂備胶濮撮…鐑藉蓟閿涘嫪娌紒瀣仢閳峰鎮楅崹顐ｇ凡閻庢凹鍣ｉ崺鈧い鎺戯功缁夐潧霉濠婂嫮绠炴い銏＄懇瀹曘劑顢樺☉娆愭澑闂備胶绮崝鏇烆嚕閸洖鐓濋柡鍥╀紳閻熼偊鐓ラ柛鏇ㄥ幘閻撲線姊虹粙鍨槰闁稿锕ら～蹇曠磼濡顎撻梺鍛婄缚閸庢煡鎮楅灏栨斀闁斥晛鍟ㄦ禒鐘绘煕閺傝法鐒告繝鈧笟鈧娲箹閻愭彃濮堕梺鍛婃尰閻熝呭垝鐠囪娲敂閸涱垰骞愰梻浣规偠閸庮噣寮插☉銏犲嚑闁哄啫鍊荤壕濂告煃闁款垰浜鹃梺绋款儐閹瑰洤顫忕紒妯肩懝闁逞屽墮椤洩顦虫い銊ｅ劥缁犳盯寮撮悙鐢电摌闂備礁鎲￠幐鍡涘礋椤愩垹绠叉繝寰锋澘鈧呭緤娴犲鐤い鏍仦閸嬪倹绻涢幋娆忕仾闁绘挻娲橀妵鍕箛闂堟稐绨绘繛瀛樼矋缁矂鈥﹂懗顖ｆЩ闂佸鏉垮濠碉紕鏁诲畷鐔碱敍濮樺吋缍傞梻浣规灱閺呮盯宕导姝ゅ洦瀵肩€涙ǚ鎷洪梺鑽ゅ枑婢瑰棝鏁嶅澶嬬厱閻庯絻鍔岄埀顒佺墬缁岃鲸绻濋崶銊モ偓濠氭煠閹帒鍔滄繛鍛矒濮婃椽宕ㄦ繝鍐槱闂佸憡蓱閸庢娊鍩㈤弮鍫濋敜婵°倓璁查幏濠氭⒑缁嬫寧婀伴柣鐕傚缁﹪鎮ч崼娑楃盎濡炪倖鍔戦崺鍕熼埀顒勬倵鐟欏嫭绀冩繛鑼枎閻ｅ嘲顫滈埀顒勫箠閻樻椿鏁嗗ù锝堫嚃閸熷骸鈹戦敍鍕杭闁稿﹥鐗滈弫顕€骞掗弬鍝勪壕婵鍘у顔锯偓瑙勬礃閸旀瑥鐣锋總绋垮嵆闁绘柨鎼敮妤呮⒒娴ｅ憡鍟炵紒璇插€婚埀顒佸嚬閸撶喎顕ｉ幎鑺ュ亜闁惧繗顫夐敍蹇涙⒑鐠団€崇€诲ù锝夋櫜閸掓帡姊绘担鍛婃儓闁兼椿鍨崇划鏃堟倻闁捐埇鍔嶇粭鐔煎焵椤掑嫬钃熸繛鎴欏灩缁犲鎮归搹鐟板妺闁诲骸顭峰鐑樺濞嗘垶鍋ч梺绋跨箲閿曘垽鎮伴鈧獮鎺楀箠閾忣偅鈷愰柟宄版噽閸栨牠寮撮悙鏉款棜闂備胶绮崹鍏兼叏閵堝纾归柣銏犳啞閻撶喖鏌曡箛濠冾潑闁哥喎绻橀弻锝夊箳濡ゅ啰鏆梺璇″枙缁瑩銆佸☉妯锋婵☆垰鎼闂傚倷绀侀悿鍥綖婢舵劕鍨傞柛褎顨呯粻鏍煃閸濆嫭濯奸柡浣革躬閺屻倕霉鐎ｎ偅鐝掔紓浣介哺钃辩紒缁樼箞閹粙妫冨☉妤冩崟婵＄偑鍊х紓姘跺础閹惰棄绠氶柛鏇ㄥ灱閺佸秹鏌ｉ幇顖氱毢闁伙絾妞介幃宄邦煥閸曨剛鍙嗛梺浼欑悼閸忔ê鐣烽敓鐘冲€烽柍鍝勫亞濞兼梹绻濈喊妯活潑闁搞劍濞婇崺娑㈠醇濠㈩亷缍侀幃婊堟嚍閵夈垺瀚藉┑鐐存尰閸╁啴宕戦幘瀵哥濞达絽鍟垮ú锕傚磻鐎ｎ喗鐓曢柍鈺佸暢濞夋煡鏌涢妷锝呭妞ゆ洟浜堕幃妤€鈽夊▍顓т簼缁傚秴螖閳ь剟鍩為幋锔藉€烽柛娆忣樈濡繝姊洪崷顓х劸妞ゎ厾鍏橀獮鍐晸閻樺啿浜滈梺绋跨箺閸嬫劙宕ｉ崱妞绘斀闁绘绮☉褎淇婇锝囨噰鐎规洜鏁婚崺鈧い鎺戝閻撶喖骞栧ǎ顒€鐏柣鎿冨灦閺屾稑螖閳ь剟宕崸妤婃晪闁挎繂妫涢々鐑芥倵閿濆簼绨介柛鏃€鎸冲娲川婵犲倸袝婵炲瓨绮庨崑銈夈€佸▎鎾冲嵆闁靛繆妾ч幏娲⒑閸︻収鐒炬繛鎾棑缁骞樼紒妯煎幍闂佸憡鍔樼亸娆戠不缂佹﹩娈介柣鎰嚟婢у灚顨ラ悙鍙夊枠闁诡啫鍥ч唶闁靛繒濮村Ч鏌ユ⒒閸屾瑧顦﹂柟纰卞亜鐓ら柨鏇炲€归弲顏堟⒒娓氣偓閳ь剛鍋涢懟顖涙櫠椤栫偞鐓熼柍鍝勶工閻忥附顨ラ悙鎻掓殭妞ゎ偅绮撻崺鈧い鎺嗗亾闁伙絽鍢查～婊堝焵椤掑嫨鈧礁鈻庨幘鏉戜患闁诲繒鍋犲Λ鍕不濞差亝鈷掑ù锝囧劋閸も偓闂佸憡鑹鹃澶愮嵁閸℃鏆嗛柛鏇ㄥ亜閻庮參鎮楃憴鍕婵炲眰鍔戦幆宀勫箻缂佹鍘介梺闈涚箳婵敻宕悙鐑樼厽闁规儳鐡ㄧ粈瀣煛瀹€鈧崰鏍嵁閸℃凹妾ㄩ梺鎼炲€楅崰鏍蓟閻旂厧绀冮柛娆忣槸缁愭盯姊洪柅鐐茶嫰婢у弶銇勯銏╂Ц閻撱倝鏌″搴″箹缂佺姾顫夐妵鍕箛閸洘顎嶉梺绋款儌閺呮粎鎹㈠┑瀣棃婵炴垵宕崜鎵磽娴ｆ彃浜鹃柣搴秵閸嬩焦绂嶅鍫熺厵閺夊牆澧介崚鎵偖濮樿埖鐓熼幖娣灱婢规﹢鏌曢崼銏╃劸妞ゎ偄绻愮叅妞ゅ繐鎳庡▓銉╂⒑闂堟稓澧曢柟鍙夌洴婵偓闁挎稑瀚鏇㈡⒑閼测斁鎷￠柛鎾寸懇閸┿垽宕奸妷锔惧幈闂佸疇顫夐崕铏閻愵兛绻嗛柣鎰典簻閳ь剚鐗滈弫顕€骞掑Δ鈧悿顔姐亜閺嶎偄浠﹂柛瀣枑閵囧嫯绠涢幘璺侯杸闂佺粯鎸鹃崰鏍偂椤愶箑鐐婇柕濠忕畱閺嗘鎮楀☉娆戠疄婵﹨娅ｉ埀顒€婀辨刊顓烆焽閹扮増鐓曢柕濞垮劜閸嬨儲顨ラ悙鎻掓殭闁宠閰ｉ獮妯虹暦閸ヨ泛鏂€闂傚倷绀佸﹢閬嶅磿閵堝憘娑㈠礃椤旇棄浠掗梺瑙勫劤婢у海澹曟禒瀣厱閻忕偛澧介幊鍛存偣閹邦亜宓嗛柡灞剧洴閹晛鐣烽崶褉鎷伴梻浣告惈閼活垶鏁冮鍫濇瀬闁圭増婢樺婵囥亜閺嶃劎鈯曟い?, '') || '';
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
    const ok = window.confirm('缂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻鐔兼⒒鐎靛壊妲紒鐐劤缂嶅﹪寮婚悢鍏尖拻閻庨潧澹婂Σ顔剧磼閻愵剙鍔ょ紓宥咃躬瀵鏁愭径濠勵吅闂佹寧绻傞幉娑㈠箻缂佹鍘遍梺闈涚墕閹冲酣顢旈銏＄厸閻忕偛澧藉ú瀛樸亜閵忊剝绀嬮柡浣瑰姍瀹曞崬鈻庡Ο鎭嶇偤姊婚崒娆愮グ妞ゆ洘鐗犲畷褰掑箮閽樺锛涢梺闈涚墕椤﹀崬鐣垫笟鈧弻鈥愁吋鎼达絼绮撻柟鍏兼儗閻撳牓寮崱娑欑厓鐟滄粓宕滃顓犫攳濠电姴鍟伴梽鍕煕濞戞﹫鍔熼柛妯挎椤啴濡堕崱妯烘殫闂侀潻绲婚崕閬嶅煝閹炬剚鐓ラ柛鏇炵仛椤旀棃姊虹紒妯哄妞ゆ洦鍘介弲鍫曨敂閸喎娈ㄩ梺褰掑亰閸樿绂嶅鍫熺厵闁告繂瀚ˉ婊兠瑰鍛壕缂佺粯绻傞銉╁几椤愨懇鍋撻弴鐔侯洸闁革富鍘剧壕濂稿级閸稑濡兼繛鎼枟椤ㄣ儵鎮欓崣澶婃灎濡炪們鍨洪…鍫ニ囬幎鑺ョ厽闁挎繂顦藉Λ鎴犵磼鏉堛劍灏伴柟宄版嚇閹煎綊鎮烽幍顕呭仹闂傚倷鑳堕崕鐢稿疾閳哄懎鍨傞柛顐ｆ礃閸嬫ɑ銇勯弮鍫熸殰闁稿鎹囬弫鎰償濠靛牊瀵滈梻浣告惈椤戝懘鏌婇敐澶嬪亗妞ゆ劧绠戦悙濠囨煏婵犲繐顩い锔哄劜缁绘繂鈻撻崹顔界亪闂佺粯鐗滈崢褔锝炶箛鏇犵＜婵☆垵顕ч鎾绘⒑閸忛棿鑸柛搴灦閸┾偓妞ゆ巻鍋撻柛鐔稿濡叉劙骞掑Δ鈧悞鍨亜閹哄秶鍔嶅┑顖涙尦閹綊宕堕妷銉ュ濠碉紕鍋犳慨銈嗙┍婵犲洦鍤嬮梻鍫熺〒缁愮偞绻濋悽闈浶㈤悗姘煎墴閻涱喚鈧綆鍠楅埛鎺懨归敐鍕劅闁衡偓娴煎瓨鐓欐繛鑼额唺闁垱鎱ㄦ繝浣虹煓鐎规洜鍠栭、娑橆潩閹插骞㈤梻鍌欐祰椤绔熼崱妯绘珷婵°倕鎳庣壕褰掓煟閵忕姵鍟為柣鎾存礋閺屻劑寮崶璺烘濡ょ姷鍋為悧婊堝焵椤掍胶鈯曠紒璇插€块垾鏃堝礃椤斿槈褔鏌涢幇鈺佸濠殿喗娲滅槐鎾存媴缁涘娈柣搴㈠嚬閸犳牕宓勯梺鍦濠㈡绮绘繝姘€垫繛鎴烆仾椤忓牜鏁侀柟鍓х帛閳锋垿鏌涢敂璇插箻閻㈩垱鐩幃浠嬵敍濮樼偓鏁剧紓浣规⒒閸犳牕顕ｉ幘顔碱潊闁抽敮鍋撻柟椋庣帛缁绘稒娼忛崜褏袣濠电偛鎷戠紞浣逛繆鐎涙绡€闁搞儯鍔庨崢閬嶆⒑鐟欏嫬鍔ゆい鏇ㄥ幘缁螣閼测晝锛滃銈嗘⒒閺咁偊骞婇崶顭戞闁绘劖娼欑粭鎺楁懚閺嶎灐褰掓晲婢跺鐝崇紓浣靛妿閺佽顫忕紒妯诲闁惧繒鎳撶粭鈥斥攽閳藉棗浜滈柛鐔告綑椤曪綁寮婚妷锕€娈ゅ銈嗗笂缁€浣规償婵犲洦鈷戠紒顖涙礀婢ф煡鎳ｈ闇夋繝濠傚閻帡鏌＄仦绯曞亾閹颁礁鎮戦梺鍛婂姂閸斿矂鈥栫€ｎ剛纾藉ù锝呮惈鏍￠梺鐟版啞閹倸锕㈡担绯曟斀闁绘顕滃銉╂煕閻旂顥嬬紒顔芥煥鐓ゆい蹇撴噽閸橀潧顪冮妶鍡橆梿鐎规洜鏁婚幆灞解枎閹扳晙绨婚梺闈涢獜缁辨洟鍩ユ径鎰厓闁芥ê顦藉Σ鍛娿亜椤愶絿绠炴い銏★耿閹瑩鎳犻璺ㄦ暰闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈡晜閽樺澹掑┑鐘灱濞夋盯鎳熼婊勵偨闁靛牆鎮胯ぐ鎺撳亹鐎瑰壊鍠栭崜浼存⒑缂佹ɑ灏伴柨鏇樺灲瀵鎮㈤崨濠勭Ф闂佸憡鎸嗛崨顔筋啅闂傚倸鍊风粈浣哥暦椤掆偓鐓ら柨鏃傚亾瀹曞弶绻濋棃娑卞剱妞ゃ儱鐗婄换娑㈠箣閻愬灚鍣х紓浣瑰姈缁嬫帞鎹㈠☉姘ｅ亾濞戞瑯鐒介柣顓滃€曢湁婵犲﹤绨肩花缁樸亜椤愩垻绠崇紒杈ㄥ笒铻ｉ悹鍥ф▕閳ь剚鎸剧槐鎾存媴閸︻厸妲堝銈嗗灥閹冲酣鍩㈤幘璇茬疀闁绘鐗冮幏娲⒑閸涘﹦缂氶柛搴ら哺閻楀酣姊绘担铏瑰笡妞ゃ劌妫涢崚鎺撴償閳儻缍侀獮鍥偋閸績鍋撻悜鑺ュ€甸梻鍫熺⊕閹叉悂鏌ｉ敃鈧悧鎾愁潖閾忓湱鐭欓柟绋垮閹疯京绱撴笟鍥ф灈缂佸鎸抽崺銏ゅ箻濞ｎ剙浜濋梺鍛婂姀閺備線骞忓ú顏呪拺闁告稑锕ョ亸鎵喐閺夊灝鏆炵紒鍌氱Т閳规垿宕堕埡鍐惧晭闂備礁鎲￠悷銉┧囨潏銊︽珷妞ゅ繐鐗婇悡娑樸€掑顒佹悙婵炲懎绉甸幈銊︾節閸曨厼绗＄紓浣诡殘閸犳牠宕洪埀顒併亜閹哄棗浜惧銈庡幖濞测晠藝瑜版帗瀵犳繝闈涙储娴滄粓鏌熼幆褍鑸归柣蹇婃櫇閻ヮ亪骞嗚閸嬨儲鎱ㄦ繝鍐┿仢妞ゃ垺顨婇崺鈧い鎺戝€婚惌娆撴煕閺囥劌骞樼紒鈧繝鍥ㄧ厸鐎广儱楠搁獮妤呮煟閹惧鎳囬柡灞剧洴楠炴ê螖閳ь剟骞婃惔锝囩當闁跨喓濮甸埛鎴︽煙閹澘袚闁轰線浜堕幃浠嬵敍濞戞ɑ璇炲┑鐘亾濞撴埃鍋撴慨濠冩そ楠炴劖鎯旈敐鍥╂殼闂備胶鎳撻崯鍧楁煀閿濆牊锛傞梻濠庡亜濞诧妇绮欓幒妤佸亗闁哄洨鍠愰崣蹇旀叏濡も偓濡鐛Δ浣典簻闁靛鍎虫晶锕傛煛瀹€瀣？濞寸媴濡囩划娆撳垂椤旇瀚熼梺璇查閻忔艾顭垮Ο灏栧亾濮樼厧骞橀柟骞垮灩閳规垹鈧綆浜為ˇ鏉款渻閵堝懐绠版繛璇х畵椤㈡挸螖閳ь剟鍩為幋锔芥櫖闁告洦鍋傞弶顓㈡⒑缁嬫鐒鹃柛濠冪箓閻ｅ嘲顭ㄩ崘锝嗙€婚梺鍦亾濞兼瑦绂嶉柆宥嗏拺缂侇垱娲栨晶鑼磼鐎ｎ亞澧﹂柛鈹惧亾濡炪倖甯婇悞锕偹夐崼鈶╁亾鐟欏嫭绀冮柨鏇樺灲閵嗕礁鈻庨幘鍐茬哎婵犮垼顕栭崹鏉棵洪敃鍌涘亗闁哄洢鍨洪崐鍫曟煟閹邦厼绲婚柍閿嬫閺屽秹顢涘☉娆戭槹闂佸搫鐭夌徊浠嬪煘閹达箑鐐婃い顓熷灦椤ュ牊绻濆▓鍨灈闁挎洏鍎遍—鍐寠婢光晜鐩畷姗€濡搁姀鈽嗘綌婵犳鍠楅敃鈺呭礈閿曞倸绾ч柟闂寸劍閳锋帒霉閿濆洨鎽傞柛銈呭暣閺屾盯鎮╁畷鍥р拰閻庤娲橀崝娆撶嵁閺嶃劎鐟归柛銉ｅ妽濞呮棃姊绘担鐟邦嚋缂佽鍊胯棟濞寸姴顑呴弸渚€鏌涢幇闈涙灍闁绘挶鍎甸弻锟犲炊椤垶鐣舵繛瀛樼矊婢х晫妲愰幘瀛樺闁告繂瀚呴敐鍥╃＜閻庯綆鍋勫ù顔尖攽閿涘嫭鏆€规洜鍠栭、娑橆潩椤掆偓閺併倝姊绘笟鈧褑鍣归梺鍛婁緱閸ㄦ壆鏁幘缁樷拻闁稿本鐟чˇ锕傛煙绾板崬浜伴挊婵喢归崗鍏肩稇缂佺姵鐗犻弻娑氫沪閹冩瘓濠电偛鍚嬮悧妤冩崲濞戞﹩鍟呮い鏃囧吹閻╁孩绻涚壕瀣汗濠电偐鍋撻梺鍝勬湰閻╊垰顕ｉ幘顔嘉╅柕澶堝労濞艰崵绱撻崒娆戝妽闁告梹鐗犻幆鍕敍濮樺吋缍庨梺鎯х箰濠€閬嶆儗濞嗘劗绠鹃柛鈩兠崝銈夋煕閹炬潙鈻曟慨濠呮缁瑥鈻庨幆褍澹勯梻浣侯焾閿曘儱煤閻旂厧绠栧Δ锝呭暞閸婂鏌﹀Ο渚Ц鐎规挸妫濆娲濞戞氨鐣鹃梺鍝勬噺缁挸顕ｉ幓鎺濈叆闁割偆鍟块幏娲⒑閸涘﹥灏扮憸鏉垮暞缁傚秹鎮欓悜妯煎幈闂佺粯妫冮弨閬嶅磻閵夛富娈介柣鎰皺缁犲磭绱掓潏銊ョ瑨閾伙綁鏌ゅù瀣珦闁哥喎閰ｅ娲传閸曞灚笑闂佺粯顨呭Λ娆撳疾閼哥數顩烽悗锝庝簽椤︻偅绻涚€电甯堕柣掳鍔戦幃鈥斥枎閹炬潙浠梺鎼炲劚濞层倝骞婇幇鐗堝剨闁割偁鍎查崐鐢告偡濞嗗繐顏璺哄閺屾盯濡搁妷褍鐓熷Δ鐘靛仜閸燁偊鍩㈡惔銊ョ闁哄鍨熼崑鎾剁磼濡湱绠氬銈嗙墬缁诲啴濡撮崘顏嗙＝闁稿本绋掔亸鏉壳庨崶褝韬柟顔界懇椤㈡棃宕熼妸銉ゅ闂佸搫绋侀崢浠嬪磻鐎ｎ偂绻嗛柕鍫濇噹閺嗘瑩鏌涢妸锔剧疄闁诡喗锕㈤幃娆撳箵閹哄棙瀵栨俊鐐€愰弲婵嬪礂濮椻偓瀵濡搁埡浣诡棟闂佸壊鐓堥崰鎺楀箰閸愵亞纾奸柣鎰靛墮缁€鍐煕鐎ｎ偄濮夋俊鍙夊姍楠炴鈧稒锚椤庢捇鏌ｉ悩鍙夌カ缂佽鲸娲熷畷婵嗙暋閹佃櫕鏂€闂佺粯鍔栬ぐ鍐棯瑜旈弻鐔煎川婵犲倵鏋欓悗娈垮枦椤曆囧煡婢舵劕顫呴柣姗€娼ч獮瀣⒒娴ｇ瓔鍤冮柛銊ラ叄瀹曟帒顫濋崗纰辨％濠电姷鏁告慨鐑姐€傞鐐潟闁哄洢鍨圭壕濠氭煙鏉堝墽鐣辩痪鎯х秺閺屸€愁吋鎼粹€茬凹闂佸搫妫欑划宀勫煘閹达附鍋愰柛娆忣槸椤︹晠姊洪幖鐐测偓鏇犫偓姘嵆瀵鈽夐姀鐘殿啋闂佽壈澹堝▔娑㈠储閳╁啰绠鹃柟瀵稿仦鐏忣厾绱掓径宀婃闁诲繐鍟村娲箰鎼达絿鐣甸梺鐟板暱闁帮絽顕ｉ幎鑺ュ€烽柣鎴烆焽閸樹粙姊虹憴鍕姢闁宦板妿缁牓宕橀鍡欙紲缂傚倷鐒﹂…鍥虹€涙﹩娈介柣鎰▕閸庡繘鏌嶇憴鍕伌鐎规洖宕～婵嬵敆閸屾艾绠ｉ梻鍌欐祰椤曆呪偓娑掓櫊椤㈡瑩寮介鐐烘７濡炪倖娲嶉崑鎾垛偓瑙勬礃婵炲﹪寮幇顓炵窞濠电姴鎳忛幉鐗堢節閻㈤潧浠﹂柛銊﹀劶瑜版粓姊洪崫鍕靛剰闂佸府缍侀幃锟狀敃閿曗偓閻愬﹪鏌曟繝蹇涙闁稿骸瀛╃换娑㈠级閹寸姵鐧侀梺绋款儐閹瑰洤顫忔繝姘＜婵炲棙鍨归悰銏ゆ⒑闁偛鑻晶浼存煕鐎ｎ偆娲撮柟宕囧枛椤㈡稑鈽夊▎鎰娇闂備礁鎲￠悷銉┧囬鐔侯洸婵犲﹤瀚ㄦ禍婊堟煙閹佃櫕娅呴柣鎺斿劋娣囧﹪宕ｆ径瀣偓鎰版煙椤曞棛绡€濠德ゅ煐瀵板嫮浠﹂挊澶屽闂傚倷鐒﹂幃鍫曞磿椤栫偛绀夐幖娣妼閻撯€愁熆鐠鸿櫣鐏辨俊顐灦閺岀喖顢涢崱妤€顏╁ù鐘虫尦濮婃椽宕崟顓犲姽缂備浇椴稿ú妯肩矉閹烘鏅滈柣鎰靛墮閻濅即姊洪崷顓犲笡閻㈩垱甯￠敐鐐哄箻閸撲胶锛濋梺绋挎湰閻熴劑宕楃仦瑙ｆ斀妞ゆ洍鍋撴繛浣冲洦鍋╂繝闈涱儏缁犵懓霉閿濆棛鎽冮柟鑺ユ礋濮婅櫣鎹勯妸銉︾亖婵犳鍠栭顓犲垝閸儱绀冩い鏃傛櫕閸橆亝绻濋悽闈涒偓顖炲礃閵婏妇浜鹃梻浣告惈濡參宕戦崨顔锯攳濠电姴娲﹂崐閿嬨亜韫囨挸顏ら柛瀣崌婵¤埖寰勬繝鍕剁幢闂備礁鎲″ú锕傚垂閹殿喚涓嶉柣妯挎珪閸欏繑淇婇悙棰濆殭濞存粓绠栭幃妤€鈻撻崹顔界仌濡炪倖娉﹂崶鑸垫櫍闂佺绻掗崢褏娆㈤悙鐑樺€甸柨婵嗙凹缁ㄨ姤淇婄紒銏犳灈闁宠鍨块幃鈺咁敊閼测晙绱樻繝鐢靛仜椤︿即鎯勯鐐偓渚€寮介鐐茬獩濡炪倖鎸荤粙鎺楁倶娴ｇ硶鏀介幒鎶藉磹閺囥垹绠犻煫鍥ㄧ☉閻撴洟鏌熺€电啸缁炬崘妫勯湁闁挎繂鐗滈崵鍐煟閹哄秶鐭欓柡灞界Ч椤㈡稑鈽夊▎鎴Ф缂傚倷娴囨ご鍝ユ暜閿熺姰鈧礁鈻庨幘鏉戞異闂佸疇顕栭崗娆撳磹濠靛钃熼柣鏃囧亹瀹撲線鏌涢…鎴濇灓濞寸姴銈稿铏光偓鍦濞兼劙鏌涢妸銉хШ闁糕斁鍋撳銈嗗笒閿曪妇绮旈悽鍛婄厱閻庯綆浜滈顏嗙磼閸屾稑绗掗悡銈嗐亜韫囨挻鍣抽柟宄邦煼濮婅櫣绮欓幐搴㈡嫳濠殿喗菧閸斿秹寮茬捄琛℃婵浜敍婊堟煟鎼搭垳绉甸柛瀣閹便劍寰勯幇顓犲幈闂佸湱鍎ら幐鍝ョ箔瑜旈弻鐔兼偡閺夋浠剧紓浣诡殘閸犳牠銆佸☉妯锋婵☆垰鍚嬭闂傚倸鍊搁崐椋庢濮橆剦鐒界憸鏃堝箖瑜斿畷鍗炩枎閹邦剙绨ユ繝纰樻閸垳鎷冮敃鍌涘€甸柤鍝ュ仯娴滄粓鏌￠崘銊モ偓鐟扳枍閺囩姷纾奸柍閿亾闁稿鎹囧缁樼瑹閳ь剙顭囪閹广垽宕卞顫秮瀹曘劎鈧稒锚閳ь剙鐏濋湁闁绘ê妯婇崕鎰版煟閹惧瓨绀冪紒缁樼洴瀹曞崬螖閸愵亶鍞归梻渚€娼荤徊鐣岀礊婵犲洤钃熺€广儱娲﹂崰鍡涙煕閺囥劌浜炲ù鐓庣焸濮婅櫣鍖栭弴鐔告緭闂佺閰ｅ褔鎮鹃悜钘夌闁绘劕绉靛Λ鍐ㄧ暦濡妲煎┑鈽嗗灠閿曨亜顫忛搹瑙勫珰闁告瑥顦弨顓烆渻閵堝骸浜滄い锔诲灣閸欏懎鈹戦悩璇у伐闁绘妫濆鍛婃媴缁洘鏂€闂佺粯锚閻ゅ洦绔熷Ο缁樹氦婵犻潧顑嗛埛鎴︽煕濞戞﹫鍔熼柍钘夘樀閺岋絾骞婇柛鏃€鍨块獮鍐晸閻樺弬銊╂煃閸濆嫬鈧悂鍩€椤掑倹鏆柡灞诲妼閳规垿宕卞Δ浣诡唲濠电姴鐥夐妶鍡╀哗缂備浇椴哥敮鈩冧繆閹间礁唯妞ゆ梹鍎抽幃鎴炵節濞堝灝鏋涢柨鏇樺劚椤啴鎸婃径灞炬濡炪倖鍔х粻鎴犵矆鐎ｎ偁浜滈柟鏉垮缁嬬粯銇勯弬鍨仾缂佺粯绻堥幃浠嬫濞戞鎽嬫俊鐐€栧ú妯煎垝鎼达絽鍨濆┑鐘宠壘缁犲鎮峰▎蹇擃伒缂佽鲸鎸荤换婵嬫偨闂堟刀鐐烘煕閵娧冨付闁崇粯鏌ㄩ埥澶愬閳ュ啿澹庨梻浣稿悑缁佹挳寮插☉鈶哄顫濋鑺ユ杸闂佺鏈喊宥夊疮閻愮儤鐓熼柟鎯х摠缁€瀣煛瀹€鈧崰鏍嵁閹达箑绠涙い鎺戝€归妤佷繆閻愵亜鈧呮媼閿濆洨涓嶉柟杈鹃檮缁犳帡姊绘担铏瑰笡閽冮亶鏌ｉ悢鏉戝姎閻撱倝鏌ㄩ弴鐐测偓褰掑磻閸岀偞鐓曢柟鏉垮悁缁ㄥジ鏌涢悩鍐插缂佺粯绻冪换婵嬪磼濠婂喚鏆紓鍌欒閸嬫捇鏌涢銈呮灁缂佺娀绠栭弻娑㈠焺閸忕媭浜幃姗€鍩℃担鍙夘潔闂佽鍎崇壕顓″€撮梻渚€鈧偛鑻晶顔剧磼閻樿尙效鐎规洘娲熼弻鍡楃暤閵夈儲鍠樻い銏＄☉椤劑宕橀悙顒夋％闂傚倷鑳堕～瀣礋閸偆鏆﹂梻浣瑰▕閺€閬嶅垂閸洖桅闁告洦鍨扮粻鎶芥煕閳╁啨浠﹀瑙勬礈缁辨捇宕掑▎鎴М濡炪倧缂氶崡鎶界嵁閹版澘绠柦妯侯槺閻ｆ椽姊虹粔鍡楀濞堛垽鏌℃担鍓插剶闁哄苯绉烽¨渚€鏌涢幘璺烘瀻妞ゆ洩绲剧换婵嗩潩椤撶喐鐝抽梻浣告啞缁嬫垿宕愭繝姘獥閹兼番鍔岄悡婵嬪箹濞ｎ剙濡肩紒鐘虫皑閹插憡鎯旈…鎴炴櫓闂佸憡娲﹂崢鍓у?);
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

  const submitDisabled = isRecording || !String(inputText || '').trim() || (useAgentMode && !selectedAgentId);
  const interruptDisabled =
    !isLoading && !((ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) || currentAudioRef.current);
  const tourToggleLabel =
    tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT
      ? '打断'
      : tourButtonState.mode === TOUR_BTN_MODE.CONTINUE
        ? '继续讲解'
        : '开始讲解';
  const tourToggleDanger = tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT;
  const tourToggleDisabled = tourButtonState.mode === TOUR_BTN_MODE.INTERRUPT ? interruptDisabled : false;
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
      await continueTour();
      return;
    }
    setTourButtonState((s) => reduceTourButtonState(s, { type: 'START_CLICK' }));
    await startTour();
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
    if (activeAskRequestIdRef) activeAskRequestIdRef.current = null;
    if (askAbortRef) askAbortRef.current = null;
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
    await startTour();
  };

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
      ? `第${displayStopIndex + 1}站${currentStopName ? ` ${currentStopName}` : ""}`
      : '未开始';
  const wakeWordLabel = wakeWordEnabled ? String(wakeWord || '').trim() || '未设置' : '未启用';
  const audienceProfileLabel = String(audienceProfile || '').trim() || '未设置';

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
