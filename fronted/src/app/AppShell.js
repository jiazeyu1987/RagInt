import React, { useEffect, useState, useRef } from 'react';
import '../App.css';
import {
  decodeAndConvertToWav16kMono as decodeAndConvertToWav16kMonoExt,
  unlockAudio as unlockAudioExt,
} from '../audio/ttsAudio';
import { cancelRequest as cancelBackendRequestExt, emitClientEvent as emitClientEventExt, fetchJson } from '../api/backendClient';
import { TourController } from '../managers/TourController';
import { InterruptManager } from '../managers/InterruptManager';
import { RunCoordinator } from '../managers/RunCoordinator';
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
import { useVoiceInputManager } from '../hooks/useVoiceInputManager';
import { useAskWorkflowManager } from '../hooks/useAskWorkflowManager';
import { useTourRecordingOptions } from '../hooks/useTourRecordingOptions';
import { useTourRecordings } from '../hooks/useTourRecordings';
import { getBackendBase } from '../config/backend';
import { sendTourControl } from '../api/tourControl';
import { parseTourCommand } from '../api/tourCommand';

function AppShell() {
  const [inputText, setInputText] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
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
  const [debugInfo, setDebugInfo] = useState(null);
  const [chatOptions, setChatOptions] = useState([]);
  const [selectedChat, setSelectedChat] = useState('展厅聊天');
  const [agentOptions, setAgentOptions] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [useAgentMode, setUseAgentMode] = useState(false);
  const [historySort, setHistorySort] = useState('time'); // 'time' | 'count'
  const [historyItems, setHistoryItems] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { options: tourRecordingOptions, refresh: refreshTourRecordingOptions } = useTourRecordingOptions({
    enabled: settingsOpen || playTourRecordingEnabled,
    limit: 50,
  });
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
  const debugRef = useRef(null);
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
    baseUrl: 'http://localhost:8000',
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
  if (!runCoordinatorRef.current) runCoordinatorRef.current = new RunCoordinator();

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
      baseUrl: 'http://localhost:8000',
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

  useEffect(() => {
    ttsEnabledRef.current = !!ttsEnabled;

    if (!ttsEnabled) {
      try {
        if (currentAudioRef.current) {
          if (typeof currentAudioRef.current.stop === 'function') {
            currentAudioRef.current.stop();
          } else if (typeof currentAudioRef.current.pause === 'function') {
            currentAudioRef.current.pause();
            currentAudioRef.current.src = '';
          }
        }
      } catch (_) {
        // ignore
      } finally {
      currentAudioRef.current = null;
      }

      if (ttsManagerRef.current) {
        ttsManagerRef.current.stop('tts_disabled');
      }
      setQueueStatus('');
    }
  }, [ttsEnabled]);

  useEffect(() => {
    try {
      const mgr = ttsManagerRef.current;
      if (mgr && typeof mgr.setTtsProvider === 'function') mgr.setTtsProvider(ttsMode, 'ui_change');
    } catch (_) {
      // ignore
    }
  }, [ttsMode]);

  useEffect(() => {
    try {
      const mgr = ttsManagerRef.current;
      if (mgr && typeof mgr.setTtsVoice === 'function') mgr.setTtsVoice(ttsMode === 'modelscope' ? modelscopeVoice : '', 'ui_change');
    } catch (_) {
      // ignore
    }
  }, [ttsMode, modelscopeVoice]);

  useEffect(() => {
    try {
      const mgr = ttsManagerRef.current;
      if (mgr && typeof mgr.setTtsSpeed === 'function') mgr.setTtsSpeed(ttsSpeed, 'ui_change');
    } catch (_) {
      // ignore
    }
  }, [ttsSpeed]);

  useEffect(() => {
    continuousTourRef.current = !!continuousTour;
  }, [continuousTour]);

  useEffect(() => {
    tourRecordingEnabledRef.current = !!tourRecordingEnabled;
  }, [tourRecordingEnabled]);

  useEffect(() => {
    playTourRecordingEnabledRef.current = !!playTourRecordingEnabled;
  }, [playTourRecordingEnabled]);

  useEffect(() => {
    selectedTourRecordingIdRef.current = String(selectedTourRecordingId || '').trim();
  }, [selectedTourRecordingId]);

  useEffect(() => {
    guideEnabledRef.current = !!guideEnabled;
  }, [guideEnabled]);

  useEffect(() => {
    tourStateRef.current = tourState;
  }, [tourState]);

  useEffect(() => {
    tourStopsRef.current = Array.isArray(tourStops) ? tourStops : [];
  }, [tourStops]);

  useEffect(() => {
    tourZoneRef.current = String(tourZone || '').trim();
  }, [tourZone]);

  useEffect(() => {
    tourStopDurationsRef.current = Array.isArray(tourStopDurations) ? tourStopDurations : [];
  }, [tourStopDurations]);

  useEffect(() => {
    tourStopTargetCharsRef.current = Array.isArray(tourStopTargetChars) ? tourStopTargetChars : [];
  }, [tourStopTargetChars]);

  useEffect(() => {
    audienceProfileRef.current = String(audienceProfile || '').trim();
  }, [audienceProfile]);

  useEffect(() => {
    tourMetaRef.current = tourMeta;
  }, [tourMeta]);

  useEffect(() => {
    guideDurationRef.current = guideDuration;
    guideStyleRef.current = guideStyle;
  }, [guideDuration, guideStyle]);

  useEffect(() => {
    tourModeRef.current = String(tourMode || 'basic');
    tourTemplateIdRef.current = String(tourTemplateId || '');
    tourStopsOverrideRef.current = Array.isArray(tourStopsOverride) ? tourStopsOverride : [];
  }, [tourMode, tourTemplateId, tourStopsOverride]);

  useEffect(() => {
    useAgentModeRef.current = !!useAgentMode;
  }, [useAgentMode]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId]);

  useEffect(() => {
    groupModeRef.current = !!groupMode;
  }, [groupMode]);

  useEffect(() => {
    queueRef.current = Array.isArray(questionQueue) ? questionQueue : [];
  }, [questionQueue]);

  const getTourStopName = (index) => {
    const stops = Array.isArray(tourStops) ? tourStops : [];
    if (!stops.length) return '';
    const i = Math.max(0, Math.min(Number(index) || 0, stops.length - 1));
    return String(stops[i] || '').trim();
  };

  const buildTourPrompt = (action, stopIndex, tailOverride) => {
    return getTourPipeline().buildTourPrompt(action, stopIndex, tailOverride);
  };

  const fetchHistory = async (sortMode) => {
    try {
      const sort = (sortMode || historySort || 'time').trim();
      const resp = await fetch(`http://localhost:8000/api/history?sort=${encodeURIComponent(sort)}&limit=200`);
      const data = await resp.json();
      const items = Array.isArray(data && data.items) ? data.items : [];
      setHistoryItems(items);
    } catch (_) {
      setHistoryItems([]);
    }
  };

  useEffect(() => {
    if (!showHistoryPanel) return;
    fetchHistory(historySort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySort, showHistoryPanel]);

  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  const beginDebugRun = (trigger) => {
    const t0 = nowMs();
    const next = {
      trigger,
      requestId: null,
      submitAt: t0,
      ragflowFirstChunkAt: null,
      ragflowFirstSegmentAt: null,
      ragflowDoneAt: null,
      ttsFirstRequestAt: null,
      ttsFirstAudioAt: null,
      ttsAllDoneAt: null,
      segments: [],
    };
    debugRef.current = next;
    setDebugInfo(next);
  };

  const debugMark = (key, t) => {
    const cur = debugRef.current;
    if (!cur) return;
    if (cur[key] != null) return;
    cur[key] = t != null ? t : nowMs();
    setDebugInfo({ ...cur, segments: [...cur.segments] });
  };

  const debugRefresh = () => {
    const cur = debugRef.current;
    if (!cur) return;
    setDebugInfo({ ...cur, segments: [...cur.segments] });
  };

  // TTS预生成配置
  const MAX_PRE_GENERATE_COUNT = 2; // 最多预生成2段音频

  // 更新队列状态显示
  const updateQueueStatus = () => {
    const mgr = ttsManagerRef.current;
    const stats = mgr ? mgr.getStats() : { textCount: 0, audioCount: 0, generatorRunning: false, playerRunning: false };
    const textCount = stats.textCount || 0;
    const audioCount = stats.audioCount || 0;
    const generatorRunning = !!stats.generatorRunning;
    const playerRunning = !!stats.playerRunning;

    setQueueStatus(
      `📝待生成: ${textCount} | 🔊预生成: ${audioCount} | ` +
      `${generatorRunning ? '🎵生成中' : '⏸️生成空闲'} | ` +
      `${playerRunning ? '🔊播放中' : '⏸️播放空闲'}`
    );
  };

  // 启动队列状态监控
  const startStatusMonitor = (runId) => {
    const interval = setInterval(() => {
      const busy = ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false;
      if (requestSeqRef.current === runId && (isLoading || busy)) {
        updateQueueStatus();
      } else {
        setQueueStatus('');
        clearInterval(interval);
      }
    }, 200); // 每200ms更新一次状态
  };

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
    baseUrl: getBackendBase(),
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

  const wakeWordFeedback = ({ message } = {}) => {
    const m = String(message || '').trim();
    if (!m) return;
    setQueueStatus(m);
    try {
      window.clearTimeout(window.__wakeWordStatusTimer);
    } catch (_) {
      // ignore
    }
    window.__wakeWordStatusTimer = window.setTimeout(() => setQueueStatus(''), 2000);
  };

  const wakeWordSubmitText = async (q) => {
    return getRunCoordinator().submitUserText({
      text: q,
      trigger: 'wake_word',
      groupMode: false,
      speakerName,
      priority: 'normal',
      useAgentMode,
      selectedAgentId,
    });
  };

  const {
    isRecording,
    startRecording,
    stopRecording,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
  } = useVoiceInputManager({
    baseUrl: getBackendBase(),
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
    onWakeWordFeedback: wakeWordFeedback,
    askQuestion,
    submitText: wakeWordSubmitText,
  });

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    const text = String(inputText || '').trim();
    if (text && (!useAgentMode || !!selectedAgentId)) {
      await getRunCoordinator().submitUserText({
        text,
        trigger: 'text',
        groupMode,
        speakerName,
        priority: questionPriority,
        useAgentMode,
        selectedAgentId,
      });
      return;
    } else if (text && useAgentMode && !selectedAgentId) {
      alert('请先选择智能体再提问');
    }
  };

  const submitTextAuto = async (text, trigger) => {
    const q = String(text || '').trim();
    if (!q) return;
    if (useAgentMode && !selectedAgentId) {
      alert('请先选择智能体再提问');
      return;
    }
    return await getRunCoordinator().submitUserText({
      text: q,
      trigger: trigger || 'quick',
      groupMode: false,
      speakerName,
      priority: 'normal',
      useAgentMode,
      selectedAgentId,
    });
  };

  const getTourController = () => {
    if (!tourControllerRef.current) tourControllerRef.current = new TourController();
    tourControllerRef.current.setDeps({
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
    });
    return tourControllerRef.current;
  };

  const getRunCoordinator = () => {
    if (!runCoordinatorRef.current) runCoordinatorRef.current = new RunCoordinator();
    runCoordinatorRef.current.setDeps({
      interruptCurrentRun,
      askQuestion,
      getTourController,
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
      getTourStops: () => (tourStopsRef.current || []),
      parseTourCommand: ({ clientId, text, stops }) => parseTourCommand({ clientId, text, stops }),
    });
    return runCoordinatorRef.current;
  };

  const startTour = async () => getRunCoordinator().startTour();
  const continueTour = async () => getRunCoordinator().continueTour();
  const prevTourStop = async () => getRunCoordinator().prevTourStop();
  const nextTourStop = async () => getRunCoordinator().nextTourStop();
  const jumpTourStop = async (idx) => getRunCoordinator().jumpTourStop(idx);
  const resetTour = () => getRunCoordinator().resetTour();

  const sendStageCommand = async (action, payload) => {
    try {
      await sendTourControl({ clientId: clientIdRef.current, action, payload: payload || {} });
    } catch (_) {
      // ignore
    }
  };

  useEffect(() => {
    if (!messagesEndRef.current) return;
    try {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (_) {
      // ignore
    }
  }, [lastQuestion, answer, isLoading, queueStatus]);

  const submitDisabled = !String(inputText || '').trim() || (useAgentMode && !selectedAgentId);
  const interruptDisabled =
    !isLoading && !((ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) || currentAudioRef.current);
  const sendMode = playTourRecordingEnabled ? 'playback' : tourRecordingEnabled ? 'recording' : 'normal';
  const sendBtnClassName = `submit-btn submit-btn-${sendMode}`;

  const onJumpSelectedStop = async () => {
    try {
      await jumpTourStop(tourSelectedStopIndex);
    } catch (e) {
      console.error('[TOUR] jump failed', e);
    }
  };

  const controlBarProps = {
    useAgentMode,
    onChangeUseAgentMode: setUseAgentMode,
    agentOptions,
    selectedAgentId,
    onChangeSelectedAgentId: setSelectedAgentId,
    chatOptions,
    selectedChat,
    onChangeSelectedChat: setSelectedChat,
    guideEnabled,
    onChangeGuideEnabled: setGuideEnabled,
    guideDuration,
    onChangeGuideDuration: setGuideDuration,
    guideStyle,
    onChangeGuideStyle: setGuideStyle,
    tourMeta,
    tourZone,
    onChangeTourZone: setTourZone,
    audienceProfile,
    onChangeAudienceProfile: setAudienceProfile,
    groupMode,
    onChangeGroupMode: setGroupMode,
    ttsEnabled,
    onChangeTtsEnabled: setTtsEnabled,
    ttsMode,
    onChangeTtsMode: setTtsMode,
    ttsSpeed,
    onChangeTtsSpeed: setTtsSpeed,
    continuousTour,
    onChangeContinuousTour: setContinuousTour,
    tourRecordingEnabled,
    onChangeTourRecordingEnabled: setTourRecordingEnabled,
    playTourRecordingEnabled,
    onChangePlayTourRecordingEnabled: setPlayTourRecordingEnabled,
    tourRecordingOptions,
    selectedTourRecordingId,
    onChangeSelectedTourRecordingId: setSelectedTourRecordingId,
    onRenameSelectedTourRecording: renameSelectedTourRecording,
    onDeleteSelectedTourRecording: deleteSelectedTourRecording,
    wakeWordEnabled,
    onChangeWakeWordEnabled: setWakeWordEnabled,
    wakeWord,
    onChangeWakeWord: setWakeWord,
    wakeWordCooldownMs,
    onChangeWakeWordCooldownMs: setWakeWordCooldownMs,
    wakeWordStrict,
    onChangeWakeWordStrict: setWakeWordStrict,
    tourState,
    currentIntent,
    tourStops,
    tourSelectedStopIndex,
    onChangeTourSelectedStopIndex: setTourSelectedStopIndex,
    onJump: onJumpSelectedStop,
    onReset: resetTour,
  };

  const stagePanelProps = {
    disabled: false,
    speedLabel: stageSpeedMode === 'fast' ? '快' : '标准',
    onPause: async () => {
      interruptCurrentRun('user_stop');
      await sendStageCommand('pause');
      setQueueStatus('已暂停');
    },
    onContinue: async () => {
      await continueTour();
      await sendStageCommand('resume');
      setQueueStatus('继续');
    },
    onSkip: async () => {
      await nextTourStop();
      await sendStageCommand('skip');
      setQueueStatus('跳过 → 下一站');
    },
    onRestart: async () => {
      resetTour();
      await startTour();
      await sendStageCommand('restart');
      setQueueStatus('重来');
    },
    onToggleSpeed: async () => {
      const next = stageSpeedMode === 'fast' ? 'normal' : 'fast';
      setStageSpeedMode(next);
      if (next === 'fast') {
        setGuideDuration('30');
        await sendStageCommand('speed', { speed: 2.0 });
        setQueueStatus('加速：30秒档');
      } else {
        setGuideDuration('60');
        await sendStageCommand('speed', { speed: 1.0 });
        setQueueStatus('加速：关闭');
      }
    },
  };

  const tourModePanelProps = {
    tourMode,
    onChangeTourMode: setTourMode,
    templates: tourTemplates,
    tourTemplateId,
    onChangeTourTemplateId: setTourTemplateId,
    tourStopsOverride,
    onChangeTourStopsOverride: setTourStopsOverride,
    onApplyTemplateZone: (z) => setTourZone(z),
  };

  const focusInputEl = () => {
    try {
      setTimeout(() => {
        if (inputElRef.current && typeof inputElRef.current.focus === 'function') {
          inputElRef.current.focus();
        }
      }, 0);
    } catch (_) {
      // ignore
    }
  };

  const onPickHistoryQuestion = (q) => {
    setInputText(q);
    focusInputEl();
  };

  const onAnswerQueuedNow = (item) => getRunCoordinator().answerQueuedNow(item);
  const onRemoveQueuedQuestion = (id) => getRunCoordinator().removeQueuedQuestion(id);
  const onInterruptManual = () => getRunCoordinator().interruptManual();
  const onOpenSettings = () => setSettingsOpen(true);
  const onCloseSettings = () => setSettingsOpen(false);
  const onQuickSummary = () => submitTextAuto('请用30秒总结刚才的讲解', 'settings_quick');
  const onChangeHistorySort = setHistorySort;
  const textInputProps = {
    isRecording,
    POINTER_SUPPORTED,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
    startRecording,
    stopRecording,
    inputElRef,
    inputText,
    onChangeInputText: setInputText,
    sendBtnClassName,
    submitDisabled,
    onOpenSettings,
  };

  // Back-compat for the inlined input markup (until it's removed).
  const onInputChange = (e) => setInputText(e.target.value);
  const onRecordBtnClick = () => {
    if (POINTER_SUPPORTED) return;
    if (isRecording) stopRecording();
    else startRecording();
  };

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
          onStartTour={startTour}
          onInterrupt={onInterruptManual}
          interruptDisabled={interruptDisabled}
          onContinueTour={continueTour}
          onSubmit={handleTextSubmit}
          textInputProps={textInputProps}
        >
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onPointerDown={onRecordPointerDown}
              onPointerUp={onRecordPointerUp}
              onPointerCancel={onRecordPointerCancel}
              onPointerLeave={onRecordPointerCancel}
              onClick={onRecordBtnClick}
              type="button"
              title="按住说话，松开后识别并填入输入框"
              aria-label={isRecording ? '录音中' : '语音输入'}
            >
              {isRecording ? '■' : '🎙'}
            </button>

            <input
              type="text"
              ref={inputElRef}
              value={inputText}
              onChange={onInputChange}
              placeholder="输入问题…"
              disabled={false}
            />

            <button type="submit" className={sendBtnClassName} disabled={submitDisabled} title="提交">
              发送
            </button>

            <button type="button" className="settings-btn" onClick={onOpenSettings} title="设置" aria-label="设置">
              ⚙
            </button>
        </InputSection>

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
