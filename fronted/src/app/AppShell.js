import React, { useEffect, useState, useRef } from 'react';
import '../App.css';
import {
  decodeAndConvertToWav16kMono as decodeAndConvertToWav16kMonoExt,
  unlockAudio as unlockAudioExt,
} from '../audio/ttsAudio';
import { cancelRequest as cancelBackendRequestExt, emitClientEvent as emitClientEventExt, fetchJson } from '../api/backendClient';
import { InterruptManager } from '../managers/InterruptManager';
import { createTtsOnStopIndexChange } from '../managers/createTtsOnStopIndexChange';
import { createOrGetTtsManager } from '../managers/createTtsManager';
import { InputSection } from '../components/InputSection';
import { SettingsPanel } from '../components/SettingsPanel';
import { MainLayout } from '../components/MainLayout';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { useBackendEvents } from '../hooks/useBackendEvents';
import { useAppSettings } from '../hooks/useAppSettings';
import { useClientId } from '../hooks/useClientId';
import { useTourBootstrap } from '../hooks/useTourBootstrap';
import { useRagflowBootstrap } from '../hooks/useRagflowBootstrap';
import { useTourState } from '../hooks/useTourState';
import { useBreakpointSync } from '../hooks/useBreakpointSync';
import { useTourTemplates } from '../hooks/useTourTemplates';
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
import { parseTourCommand } from '../api/tourCommand';

const TOUR_BTN_MODE = {
  START: 'start',
  INTERRUPT: 'interrupt',
  CONTINUE: 'continue',
};

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
  const [inputText, setInputText] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
  const [tourButtonState, setTourButtonState] = useState({ started: false, mode: TOUR_BTN_MODE.START });
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const {
    ttsMode,
    setTtsMode,
    modelscopeVoice,
    setModelscopeVoice,
    ttsSpeed,
    setTtsSpeed,
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
    tourMode,
    setTourMode,
    tourTemplateId,
    setTourTemplateId,
    tourStopsOverride,
    setTourStopsOverride,
    wakeWordEnabled,
    setWakeWordEnabled,
    wakeWord,
    setWakeWord,
    wakeWordCooldownMs,
    setWakeWordCooldownMs,
    wakeWordStrict,
    setWakeWordStrict,
  } = useAppSettings();
  const [chatOptions, setChatOptions] = useState([]);
  const [selectedChat, setSelectedChat] = useState('展厅聊天');
  const [agentOptions, setAgentOptions] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [useAgentMode, setUseAgentMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { options: tourRecordingOptions, refresh: refreshTourRecordingOptions } = useTourRecordingOptions({
    enabled: settingsOpen || playTourRecordingEnabled,
    limit: 50,
  });
  const { historySort, setHistorySort, historyItems, fetchHistory } = useHistoryPanel({ enabled: showHistoryPanel });
  const { debugInfo, debugRef, beginDebugRun, debugMark, debugRefresh } = useDebugRun();
  const clientId = useClientId();
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
  const { templates: tourTemplates } = useTourTemplates({ enabled: settingsOpen || !!guideEnabled });
  const { status: serverStatus, error: serverStatusErr } = useBackendStatus(debugInfo && debugInfo.requestId);
  const { items: serverEvents, lastError: serverLastError, error: serverEventsErr } = useBackendEvents(debugInfo && debugInfo.requestId);
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
      tourMode,
      tourTemplateId,
      tourStopsOverride,
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
          if (typeof bp.tourMode === 'string' && bp.tourMode) setTourMode(bp.tourMode);
          if (typeof bp.tourTemplateId === 'string') setTourTemplateId(bp.tourTemplateId);
          if (Array.isArray(bp.tourStopsOverride)) setTourStopsOverride(bp.tourStopsOverride);
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
  const tourModeRef = useRef(tourMode);
  const tourTemplateIdRef = useRef(tourTemplateId);
  const tourStopsOverrideRef = useRef(tourStopsOverride);
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
  const MIN_RECORD_MS = 900;

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
      ttsMode,
      ttsVoice: ttsMode === 'modelscope' ? modelscopeVoice : '',
      ttsSpeed,
      emitClientEvent: (evt) => emitClientEventExt({ ...(evt || {}), clientId: clientIdRef.current }),
      onStopIndexChange: createTtsOnStopIndexChange({
        guideEnabledRef,
        tourStateRef,
        tourPipelineRef,
        ttsEnabledRef,
        getTourStopName,
        setTourState,
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
    tourMode,
    tourModeRef,
    tourTemplateId,
    tourTemplateIdRef,
    tourStopsOverride,
    tourStopsOverrideRef,
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

  // TTS预生成配置
  const MAX_PRE_GENERATE_COUNT = 2; // 最多预生成2段音频

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
    const next = window.prompt('请输入存档名称', '') || '';
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
    const ok = window.confirm('确认删除该存档？删除后无法恢复。');
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
      tourModeRef,
      tourTemplateIdRef,
      tourStopsOverrideRef,
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
      setTourState,
      getTourStopName,
      setAnswer,
    },
    runCoordinatorDeps: {
      interruptCurrentRun,
      askQuestion,
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

  const {
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
  } = useVoiceConversationControls({
    baseUrl: backendBase,
    minRecordMs: MIN_RECORD_MS,
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
    setQueueStatus,
    inputText,
    groupMode,
    speakerName,
    questionPriority,
    useAgentMode,
    selectedAgentId,
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

  const submitDisabled = !String(inputText || '').trim() || (useAgentMode && !selectedAgentId);
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
    setQueueStatus('');
    setQuestionQueue([]);
    setCurrentIntent(null);
    setIsLoading(false);
    setTourSelectedStopIndex(0);
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
    tourState,
    currentIntent,
    tourStops,
    tourSelectedStopIndex,
    setTourSelectedStopIndex,
    jumpTourStop,
    resetTour,
  });

  const tourModePanelProps = useTourModePanelProps({
    tourMode,
    setTourMode,
    tourTemplates,
    tourTemplateId,
    setTourTemplateId,
    tourStopsOverride,
    setTourStopsOverride,
    setTourZone,
  });

  const { onPickHistoryQuestion, onQuickSummary, onChangeHistorySort } = useUiActions({
    inputElRef,
    setInputText,
    submitTextAuto,
    setHistorySort,
    setSettingsOpen,
  });

  const { textInputProps, onCloseSettings } = useTextInputProps({
    isRecording,
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
    submitDisabled,
    setSettingsOpen,
  });

  return (
    <div className="app">
      <div className="container">
        <MainLayout
          showHistoryPanel={showHistoryPanel}
          historySort={historySort}
          onChangeHistorySort={onChangeHistorySort}
          historyItems={historyItems}
          onPickHistoryQuestion={onPickHistoryQuestion}
          lastQuestion={lastQuestion}
          answer={answer}
          isLoading={isLoading}
          queueStatus={queueStatus}
          messagesEndRef={messagesEndRef}
          showDebugPanel={showDebugPanel}
          debugInfo={debugInfo}
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

        <InputSection
          onTourToggle={onTourToggle}
          tourToggleLabel={tourToggleLabel}
          tourToggleDanger={tourToggleDanger}
          tourToggleDisabled={tourToggleDisabled}
          onReset={onResetAll}
          onSubmit={handleTextSubmit}
          textInputProps={textInputProps}
        />

        <SettingsPanel
          open={settingsOpen}
          onClose={onCloseSettings}
          showHistoryPanel={showHistoryPanel}
          onChangeShowHistoryPanel={setShowHistoryPanel}
          showDebugPanel={showDebugPanel}
          onChangeShowDebugPanel={setShowDebugPanel}
          controlBarProps={controlBarProps}
          stagePanelProps={stagePanelProps}
          tourModePanelProps={tourModePanelProps}
          sellingPointsStopName={getTourStopName(tourSelectedStopIndex)}
          ttsMode={ttsMode}
          modelscopeVoice={modelscopeVoice}
          onChangeModelscopeVoice={setModelscopeVoice}
          groupMode={groupMode}
          speakerName={speakerName}
          onChangeSpeakerName={setSpeakerName}
          questionPriority={questionPriority}
          onChangeQuestionPriority={setQuestionPriority}
          onQuickSummary={onQuickSummary}
          onPrevStop={prevTourStop}
          onNextStop={nextTourStop}
        />
      </div>
    </div>
  );
}

export default AppShell;
