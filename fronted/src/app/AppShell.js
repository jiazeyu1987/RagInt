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
import { ASK_TRACE_DEBUG, WAKE_HOLD_MS } from '../config/features';
import { parseTourCommand } from '../api/tourCommand';
import {
  MAX_PRE_GENERATE_COUNT,
  PREFERRED_TTS_SAMPLE_RATE,
  buildSendButtonClassName,
  buildSubmitDisabled,
  buildTourToggleViewModel,
  createInitialAnswerCacheMeta,
  createInitialTourButtonState,
  createInitialTourMeta,
  isPointerEventSupported,
} from './appShellState';
import { useAppShellE2eBridge } from './useAppShellE2eBridge';
import { useAppShellAsrInput } from './useAppShellAsrInput';
import { useAppShellBrowserServices } from './useAppShellBrowserServices';
import { useAppShellReset } from './useAppShellReset';
import { useAppShellTourHelpers } from './useAppShellTourHelpers';
import { useAppShellTtsManager } from './useAppShellTtsManager';
import { useAppShellUiMode } from './useAppShellUiMode';
import { useAppShellVoiceResumeGuards } from './useAppShellVoiceResumeGuards';
import { useAsrFilterPrefetch } from './useAsrFilterPrefetch';
import { useClearExhibitChatSessions } from './useClearExhibitChatSessions';
import { useEscapeInterrupt } from './useEscapeInterrupt';
import { useHomeStatusBarProps } from './useHomeStatusBarProps';
import { useRagflowConnectionState } from './useRagflowConnectionState';
import { useRagflowConversationSelection } from './useRagflowConversationSelection';
import { useRightPanelTabsProps } from './useRightPanelTabsProps';
import { useScrollChatToBottom } from './useScrollChatToBottom';
import { useSimpleTtsPlaying } from './useSimpleTtsPlaying';
import { useTourButtonPlaybackSync } from './useTourButtonPlaybackSync';
import { useTourRecordingPlaybackSelection } from './useTourRecordingPlaybackSelection';
import { useTourToggleActions } from './useTourToggleActions';
import { useTransientQueueStatus } from './useTransientQueueStatus';

function AppShell() {
  const backendBase = getBackendBase();
  const [lastQuestion, setLastQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerCacheMeta, setAnswerCacheMeta] = useState(createInitialAnswerCacheMeta);
  const [qaCacheDebug, setQaCacheDebug] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { queueStatus, setQueueStatus, showTransientQueueStatus } = useTransientQueueStatus();
  const {
    ragflowConnection,
    ragflowQueueStatus,
    ragflowUnavailable,
    ragflowStatusLabel,
    ragflowStatusTone,
    markRagflowAvailable,
    markRagflowUnavailable,
  } = useRagflowConnectionState();
  const [tourButtonState, setTourButtonState] = useState(createInitialTourButtonState);
  const { uiViewMode, openFullUi, openSimpleUi, openPadHome } = useAppShellUiMode();
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
    asrAutoResumeAfterAnswerEnabled,
    setAsrAutoResumeAfterAnswerEnabled,
    asrAutoResumeAfterAnswerDelayMs,
    setAsrAutoResumeAfterAnswerDelayMs,
    asrConversationAutoSubmitSilenceMs,
    setAsrConversationAutoSubmitSilenceMs,
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
  const [tourMeta, setTourMeta] = useState(createInitialTourMeta);
  const [questionPriority, setQuestionPriority] = useState('normal'); // 'normal' | 'high'
  const [questionQueue, setQuestionQueue] = useState([]);
  const [stageSpeedMode, setStageSpeedMode] = useState('normal'); // 'normal' | 'fast'
  const debugPollingRequestId = debugInfo && debugInfo.requestId ? debugInfo.requestId : '';
  const debugPollingEnabled = !!debugPollingRequestId && (!!isLoading || !!showDebugPanel);
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
    onError: ({ phase, error }) => {
      const message = String((error && error.message) || error || '').trim();
      if (!message) return;
      setQueueStatus(`断点同步失败: ${message}`);
      // eslint-disable-next-line no-console
      console.error(`[BREAKPOINT_SYNC_${String(phase || 'unknown').toUpperCase()}]`, error);
    },
  });

  const messagesEndRef = useRef(null);
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
  const {
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
  } = useAppShellAsrInput({
    filterAsrText: filterAsrTextExt,
    wakeHoldMs: WAKE_HOLD_MS,
    setQueueStatus,
    showTransientQueueStatus,
    wakeWordEnabled,
    wakeWord,
    wakeWordStrict,
    asrTextFilterEnabled,
    asrTextFilterPrompt,
    asrTextFilterChatName,
    asrTextFilterTerms,
  });

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
  const inputElRef = useRef(null);
  const tourControllerRef = useRef(null);
  const runCoordinatorRef = useRef(null);

  const POINTER_SUPPORTED = isPointerEventSupported();

  const { cancelBackendRequest, decodeAndConvertToWav16kMono, unlockAudio } = useAppShellBrowserServices({
    clientIdRef,
    audioContextRef,
    cancelRequest: cancelBackendRequestExt,
    decodeAndConvertToWav16kMono: decodeAndConvertToWav16kMonoExt,
    unlockAudio: unlockAudioExt,
    preferredTtsSampleRate: PREFERRED_TTS_SAMPLE_RATE,
  });

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
    asrConversationContextStrategy,
    asrConversationContextStrategyRef,
    asrConversationContextRecentTurns,
    asrConversationContextRecentTurnsRef,
    asrConversationContextMaxTokens,
    asrConversationContextMaxTokensRef,
  });

  const { getTourStopName, buildTourPrompt, nowMs } = useAppShellTourHelpers({ tourStops, getTourPipeline });

  const { getTtsManager } = useAppShellTtsManager({
    ttsManagerRef,
    audioContextRef,
    currentAudioRef,
    requestSeqRef,
    clientIdRef,
    nowMs,
    backendBase,
    maxPreGenerateCount: MAX_PRE_GENERATE_COUNT,
    ttsFetchConcurrency,
    ttsMode,
    modelscopeVoice,
    ttsSpeed,
    emitClientEvent: emitClientEventExt,
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
  });

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


  const { clearExhibitChatSessions } = useClearExhibitChatSessions();

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
    setActiveRagflowConversationName,
    askTraceDebug: ASK_TRACE_DEBUG,
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
    consumePendingAsrClientEvents,
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

  useEscapeInterrupt({
    isLoading,
    askAbortRef,
    ttsManagerRef,
    currentAudioRef,
    getRunCoordinator,
  });

  const { isRunActiveForBargeIn, canAutoResumeTour, shouldAutoResumeTour, isAsrBusyForResume } =
    useAppShellVoiceResumeGuards({
      askAbortRef,
      currentAudioRef,
      ttsManagerRef,
      tourPipelineRef,
      tourStateRef,
      lastAsrInputChangeAtRef,
      isLoading,
    });

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
    autoSubmitSilenceMs: asrConversationAutoSubmitSilenceMs,
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

  useAsrFilterPrefetch({
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
    pipelineRef: asrPostProcessPipelineRef,
  });

  useScrollChatToBottom({ messagesEndRef, lastQuestion, answer, isLoading, queueStatus });

  useTourRecordingPlaybackSelection({
    tourRecordingEnabled,
    setTourRecordingEnabled,
    playTourRecordingEnabled,
    setPlayTourRecordingEnabled,
    tourRecordingOptionsReady,
    tourRecordingOptions,
    selectedTourRecordingId,
    setSelectedTourRecordingId,
  });

  const { resetTourButtonPlaybackActivity } = useTourButtonPlaybackSync({
    isLoading,
    askAbortRef,
    currentAudioRef,
    ttsManagerRef,
    tourState,
    setTourButtonState,
  });

  const simpleTtsPlaying = useSimpleTtsPlaying({ uiViewMode, currentAudioRef });

  useEffect(() => {
    if (ragflowQueueStatus) setQueueStatus(ragflowQueueStatus);
  }, [ragflowQueueStatus, setQueueStatus]);
  const { prepareTourRagflowConversation, ragflowConversationLabel } =
    useRagflowConversationSelection({
      ragflowUnavailable,
      useAgentMode,
      selectedChatRef,
      selectedChat,
      chatOptions,
      setSelectedChat,
      isLoading,
      activeRagflowConversationName,
      setActiveRagflowConversationName,
    });
  const submitDisabled = buildSubmitDisabled({
    isRecording,
    inputText,
    useAgentMode,
    selectedAgentId,
    ragflowUnavailable,
  });
  const interruptDisabled =
    !isLoading && !((ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) || currentAudioRef.current);
  const {
    label: tourToggleLabel,
    danger: tourToggleDanger,
    disabled: tourToggleDisabled,
  } = buildTourToggleViewModel({ tourButtonState, interruptDisabled, ragflowUnavailable });
  const sendBtnClassName = buildSendButtonClassName({ playTourRecordingEnabled, tourRecordingEnabled });

  const { onResetAll } = useAppShellReset({
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
  });

  const { onTourToggle, onSimpleTourToggle, simpleTourRunning } = useTourToggleActions({
    tourButtonState,
    setTourButtonState,
    onInterruptManual,
    continueTour,
    startTour,
    prepareTourRagflowConversation,
    markRagflowAvailable,
    markRagflowUnavailable,
    onResetAll,
  });

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
    asrAutoResumeAfterAnswerEnabled,
    setAsrAutoResumeAfterAnswerEnabled,
    asrAutoResumeAfterAnswerDelayMs,
    setAsrAutoResumeAfterAnswerDelayMs,
    asrConversationAutoSubmitSilenceMs,
    setAsrConversationAutoSubmitSilenceMs,
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

  syncAsrProbeState({
    queueStatus,
    isRecording,
    isRecognizing,
    recognitionStage,
  });

  useAppShellE2eBridge({
    asrE2eProbeRef,
    groupMode,
    questionPriority,
    useAgentMode,
    selectedAgentId,
    setGroupMode,
    setQuestionPriority,
    setUseAgentMode,
    setSelectedAgentId,
  });

  const homeStatusBarProps = useHomeStatusBarProps({
    playTourRecordingEnabled,
    tourRecordingEnabled,
    setTourRecordingEnabled,
    setPlayTourRecordingEnabled,
    tourGuideTemplates,
    tourGuideTemplateId,
    setTourGuideTemplateId,
    tourMeta,
    audienceProfile,
    setAudienceProfile,
    tourState,
    tourStops,
    wakeWordEnabled,
    wakeWord,
    ttsSpeed,
    setTtsSpeed,
    ragflowStatusLabel,
    ragflowStatusTone,
    ragflowConversationLabel,
    debugInfo,
    serverStatus,
    ttsEnabled,
  });
  const rightPanelTabsProps = useRightPanelTabsProps({
    showHistoryPanel,
    historySort,
    onChangeHistorySort,
    historyItems,
    onPickHistoryQuestion,
    showDebugPanel,
    debugInfo,
    qaCacheDebug,
    guideModeLabel: homeStatusBarProps.currentModeLabel,
    ttsEnabled,
    tourState,
    serverStatus,
    serverStatusErr,
    serverEvents,
    serverEventsErr,
    serverLastError,
    questionQueue,
    onAnswerQueuedNow,
    onRemoveQueuedQuestion,
  });

  if (uiViewMode === 'simple') {
    return (
      <div className="app">
        <div className="container simple-tour-container">
          <SimpleTourControlPage
            isRunning={simpleTourRunning}
            showWave={simpleTtsPlaying}
            onToggle={onSimpleTourToggle}
            onOpenMainPage={openFullUi}
            onOpenPadHome={openPadHome}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <HomeStatusBar {...homeStatusBarProps} />

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
            <RightPanelTabs {...rightPanelTabsProps} />
          </div>
        </div>

        <InputSection
          onBackToSimple={openSimpleUi}
          onOpenPadHome={openPadHome}
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

