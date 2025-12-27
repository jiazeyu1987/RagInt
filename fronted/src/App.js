import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import {
  decodeAndConvertToWav16kMono as decodeAndConvertToWav16kMonoExt,
  unlockAudio as unlockAudioExt,
} from './audio/ttsAudio';
import { cancelRequest as cancelBackendRequestExt, emitClientEvent as emitClientEventExt, fetchJson } from './api/backendClient';
import { TourController } from './managers/TourController';
import { createTtsOnStopIndexChange } from './managers/createTtsOnStopIndexChange';
import { createOrGetTtsManager } from './managers/createTtsManager';
import { HistoryPanel } from './components/HistoryPanel';
import { DebugPanel } from './components/DebugPanel';
import { ControlBar } from './components/ControlBar';
import { Composer } from './components/Composer';
import { ChatPanel } from './components/ChatPanel';
import { useBackendStatus } from './hooks/useBackendStatus';
import { useBackendEvents } from './hooks/useBackendEvents';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { useTourBootstrap } from './hooks/useTourBootstrap';
import { useRagflowBootstrap } from './hooks/useRagflowBootstrap';
import { useTourState } from './hooks/useTourState';
import { useTourPipelineManager } from './hooks/useTourPipelineManager';
import { useRecorderWorkflow } from './hooks/useRecorderWorkflow';
import { useAskWorkflowManager } from './hooks/useAskWorkflowManager';

function App() {
  const [inputText, setInputText] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsMode, setTtsMode] = useLocalStorageState('ttsMode', 'modelscope', {
    serialize: (v) => String(v || 'modelscope'),
    deserialize: (raw) => {
      const m = String(raw || 'modelscope').trim().toLowerCase();
      if (m === 'online') return 'modelscope'; // backward compat
      if (m === 'local') return 'sovtts1'; // backward compat
      if (m === 'sovtts1' || m === 'sovtts2' || m === 'modelscope') return m;
      return 'modelscope';
    },
  });
  const [debugInfo, setDebugInfo] = useState(null);
  const [chatOptions, setChatOptions] = useState([]);
  const [selectedChat, setSelectedChat] = useState('展厅聊天');
  const [agentOptions, setAgentOptions] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [useAgentMode, setUseAgentMode] = useState(false);
  const [guideEnabled, setGuideEnabled] = useLocalStorageState('guideEnabled', true, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });
  const [continuousTour, setContinuousTour] = useLocalStorageState('continuousTour', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });
  const [guideDuration, setGuideDuration] = useLocalStorageState('guideDuration', '60', {
    serialize: (v) => String(v || '60'),
    deserialize: (raw) => String(raw || '60'),
  });
  const [guideStyle, setGuideStyle] = useLocalStorageState('guideStyle', 'friendly', {
    serialize: (v) => String(v || 'friendly'),
    deserialize: (raw) => String(raw || 'friendly'),
  });
  const [historySort, setHistorySort] = useState('time'); // 'time' | 'count'
  const [historyItems, setHistoryItems] = useState([]);
  const [clientId] = useState(() => {
    try {
      const existing = localStorage.getItem('clientId');
      if (existing) return existing;
      const next =
        (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`);
      localStorage.setItem('clientId', next);
      return next;
    } catch (_) {
      return `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  });
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
  const [tourZone, setTourZone] = useLocalStorageState('tourZone', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });
  const [audienceProfile, setAudienceProfile] = useLocalStorageState('audienceProfile', '', {
    serialize: (v) => String(v || ''),
    deserialize: (raw) => String(raw || ''),
  });
  const [groupMode, setGroupMode] = useLocalStorageState('groupMode', false, {
    serialize: (v) => (v ? '1' : '0'),
    deserialize: (raw) => String(raw) === '1',
  });
  const [speakerName, setSpeakerName] = useLocalStorageState('speakerName', '观众A', {
    serialize: (v) => String(v || '观众A'),
    deserialize: (raw) => String(raw || '观众A'),
  });
  const [questionPriority, setQuestionPriority] = useState('normal'); // 'normal' | 'high'
  const [questionQueue, setQuestionQueue] = useState([]);
  const { status: serverStatus, error: serverStatusErr } = useBackendStatus(debugInfo && debugInfo.requestId);
  const { items: serverEvents, lastError: serverLastError, error: serverEventsErr } = useBackendEvents(debugInfo && debugInfo.requestId);
  const [currentIntent, setCurrentIntent] = useState(null);
  const [tourSelectedStopIndex, setTourSelectedStopIndex] = useLocalStorageState('tourSelectedStopIndex', 0, {
    serialize: (v) => String(Number.isFinite(Number(v)) ? Number(v) : 0),
    deserialize: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    },
  });

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
  const messagesEndRef = useRef(null);
  const PREFERRED_TTS_SAMPLE_RATE = 16000;
  const ttsEnabledRef = useRef(true);
  const continuousTourRef = useRef(continuousTour);
  const guideEnabledRef = useRef(guideEnabled);
  const tourStopsRef = useRef(tourStops);
  const tourZoneRef = useRef(tourZone);
  const audienceProfileRef = useRef(audienceProfile);
  const guideDurationRef = useRef(guideDuration);
  const guideStyleRef = useRef(guideStyle);
  const useAgentModeRef = useRef(useAgentMode);
  const selectedChatRef = useRef(selectedChat);
  const selectedAgentIdRef = useRef(selectedAgentId);
  const tourMetaRef = useRef(tourMeta);
  const debugRef = useRef(null);
  const askAbortRef = useRef(null);
  const tourStateRef = useRef(tourState);
  const tourStopDurationsRef = useRef(tourStopDurations);
  const tourStopTargetCharsRef = useRef(tourStopTargetChars);
  const clientIdRef = useRef(clientId);
  const activeAskRequestIdRef = useRef(null);
  const groupModeRef = useRef(groupMode);
  const queueRef = useRef([]);
  const lastSpeakerRef = useRef('');

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
    useAgentModeRef,
    selectedChatRef,
    selectedAgentIdRef,
    maxPrefetchAhead: 1,
    onLog: console.log,
    onWarn: console.warn,
  });

  const runIdRef = useRef(0);
  const currentAudioRef = useRef(null);
  const receivedSegmentsRef = useRef(false);
  const audioContextRef = useRef(null);
  const USE_SAVED_TTS = false;
  const inputElRef = useRef(null);
  const tourControllerRef = useRef(null);

  const POINTER_SUPPORTED = typeof window !== 'undefined' && 'PointerEvent' in window;
  const MIN_RECORD_MS = 900;

  const getTtsManager = () =>
    createOrGetTtsManager({
      ttsManagerRef,
      audioContextRef,
      currentAudioRef,
      runIdRef,
      clientIdRef,
      nowMs,
      baseUrl: 'http://localhost:8000',
      useSavedTts: USE_SAVED_TTS,
      maxPreGenerateCount: MAX_PRE_GENERATE_COUNT,
      ttsMode,
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
        ensureTtsRunning: () => {
          const mgr = ttsManagerRef.current;
          if (mgr) mgr.ensureRunning();
        },
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
      interruptCurrentRun('escape');
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
    continuousTourRef.current = !!continuousTour;
  }, [continuousTour]);

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

  const enqueueQuestion = ({ speaker, text, priority }) => {
    const item = {
      id: `q_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      speaker: String(speaker || '观众').trim() || '观众',
      text: String(text || '').trim(),
      priority: priority === 'high' ? 'high' : 'normal',
      ts: Date.now(),
    };
    if (!item.text) return null;
    const next = [...(queueRef.current || []), item];
    queueRef.current = next;
    setQuestionQueue(next);
    return item;
  };

  const removeQueuedQuestion = (id) => {
    const next = (queueRef.current || []).filter((q) => q && q.id !== id);
    queueRef.current = next;
    setQuestionQueue(next);
  };

  const pickNextQueuedQuestion = () => {
    const q = queueRef.current || [];
    if (!q.length) return null;
    const highs = q.filter((x) => x && x.priority === 'high');
    const pool = highs.length ? highs : q;
    const last = String(lastSpeakerRef.current || '');
    const diff = pool.find((x) => String(x.speaker || '') !== last) || pool[0];
    if (!diff) return null;
    return diff;
  };

  const maybeStartNextQueuedQuestion = async () => {
    if (!groupModeRef.current) return;
    if (tourPipelineRef.current && tourPipelineRef.current.isActive()) return;
    const ttsBusy = ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false;
    if (isLoading || askAbortRef.current || ttsBusy) return;
    const next = pickNextQueuedQuestion();
    if (!next) return;
    removeQueuedQuestion(next.id);
    lastSpeakerRef.current = String(next.speaker || '');
    const prefixed = `【提问人：${String(next.speaker || '').trim() || '观众'}】${next.text}`;
    try {
      beginDebugRun(next.priority === 'high' ? 'group_high' : 'group_next');
      await askQuestion(prefixed, { fromQueue: true });
    } catch (e) {
      console.error('[QUEUE] auto ask failed', e);
    }
  };

  const answerQueuedNow = async (item) => {
    if (!item || !item.id) return;
    try {
      removeQueuedQuestion(item.id);
      lastSpeakerRef.current = String(item.speaker || '');
      const prefixed = `【提问人：${String(item.speaker || '').trim() || '观众'}】${String(item.text || '').trim()}`;
      const active =
        !!askAbortRef.current ||
        isLoading ||
        !!currentAudioRef.current ||
        (ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false);
      if (active) interruptCurrentRun('queue_takeover');
      beginDebugRun(item.priority === 'high' ? 'group_high' : 'group_takeover');
      await askQuestion(prefixed, { fromQueue: true });
    } catch (e) {
      console.error('[QUEUE] takeover failed', e);
    }
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
    fetchHistory(historySort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySort]);

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
      if (runIdRef.current === runId && (isLoading || busy)) {
        updateQueueStatus();
      } else {
        setQueueStatus('');
        clearInterval(interval);
      }
    }, 200); // 每200ms更新一次状态
  };

  const {
    isRecording,
    startRecording,
    stopRecording,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
  } = useRecorderWorkflow({
    baseUrl: 'http://localhost:8000',
    minRecordMs: MIN_RECORD_MS,
    clientIdRef,
    setInputText,
    setIsLoading,
    decodeAndConvertToWav16kMono,
    unlockAudio,
    ttsEnabledRef,
    audioContextRef,
  });

  const { interruptCurrentRun, askQuestion } = useAskWorkflowManager({
    baseUrl: 'http://localhost:8000',
    getIsLoading: () => isLoading,
    runIdRef,
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
    getTourStopName,
    startStatusMonitor,
    guideEnabledRef,
    guideDurationRef,
    guideStyleRef,
    useAgentModeRef,
    selectedChatRef,
    selectedAgentIdRef,
    tourStopDurationsRef,
    tourStopTargetCharsRef,
    currentAudioRef,
    getHistorySort: () => historySort,
    fetchHistory,
    maybeStartNextQueuedQuestion,
  });


  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (ttsEnabledRef.current) {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
      unlockAudio();
    }
    const text = String(inputText || '').trim();
    if (text && (!useAgentMode || !!selectedAgentId)) {
      beginDebugRun('text');
      setInputText('');
      const active =
        !!askAbortRef.current ||
        isLoading ||
        !!currentAudioRef.current ||
        (ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false);
      if (groupMode) {
        const item = enqueueQuestion({ speaker: speakerName, text, priority: questionPriority });
        if (item && item.priority === 'high' && active) {
          try {
            interruptCurrentRun('high_priority');
          } catch (_) {
            // ignore
          }
          removeQueuedQuestion(item.id);
          lastSpeakerRef.current = String(item.speaker || '');
          await askQuestion(`【提问人：${item.speaker}】${item.text}`, { fromQueue: true });
          return;
        }
        if (!active) {
          await maybeStartNextQueuedQuestion();
        }
        return;
      }
      await askQuestion(text);
    } else if (text && useAgentMode && !selectedAgentId) {
      alert('请选择智能体后再提问');
    }
  };

  const submitTextAuto = async (text, trigger) => {
    const q = String(text || '').trim();
    if (!q) return;
    if (useAgentMode && !selectedAgentId) {
      alert('请选择智能体后再提问');
      return;
    }
    if (ttsEnabledRef.current) {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
      unlockAudio();
    }
  beginDebugRun(trigger || 'quick');
  setInputText('');
  await askQuestion(q);
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
      tourStateRef,
      getTourStops: () => (tourStopsRef.current || []),
      buildTourPrompt,
      beginDebugRun,
      askQuestion,
      getTourPipeline,
      interruptCurrentRun,
      setTourState,
    });
    return tourControllerRef.current;
  };

  const startTour = async () => getTourController().start();

  const continueTour = async () => getTourController().continue();

  const prevTourStop = async () => getTourController().prevStop();

  const nextTourStop = async () => getTourController().nextStop();

  const jumpTourStop = async (idx) => getTourController().jumpTo(idx);

  const resetTour = () => getTourController().reset();

  useEffect(() => {
    if (!messagesEndRef.current) return;
    try {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (_) {
      // ignore
    }
  }, [lastQuestion, answer, isLoading, queueStatus]);

  return (
    <div className="app">
      <div className="container">
        <h1>AI语音问答</h1>

        <ControlBar
          useAgentMode={useAgentMode}
          onChangeUseAgentMode={setUseAgentMode}
          agentOptions={agentOptions}
          selectedAgentId={selectedAgentId}
          onChangeSelectedAgentId={setSelectedAgentId}
          chatOptions={chatOptions}
          selectedChat={selectedChat}
          onChangeSelectedChat={setSelectedChat}
          guideEnabled={guideEnabled}
          onChangeGuideEnabled={setGuideEnabled}
          guideDuration={guideDuration}
          onChangeGuideDuration={setGuideDuration}
          guideStyle={guideStyle}
          onChangeGuideStyle={setGuideStyle}
          tourMeta={tourMeta}
          tourZone={tourZone}
          onChangeTourZone={setTourZone}
          audienceProfile={audienceProfile}
          onChangeAudienceProfile={setAudienceProfile}
          groupMode={groupMode}
          onChangeGroupMode={setGroupMode}
          ttsEnabled={ttsEnabled}
          onChangeTtsEnabled={setTtsEnabled}
          ttsMode={ttsMode}
          onChangeTtsMode={setTtsMode}
          continuousTour={continuousTour}
          onChangeContinuousTour={setContinuousTour}
          tourState={tourState}
          currentIntent={currentIntent}
          tourStops={tourStops}
          tourSelectedStopIndex={tourSelectedStopIndex}
          onChangeTourSelectedStopIndex={setTourSelectedStopIndex}
          onJump={async () => {
            try {
              await jumpTourStop(tourSelectedStopIndex);
            } catch (e) {
              console.error('[TOUR] jump failed', e);
            }
          }}
          onReset={resetTour}
        />

        <Composer
          isRecording={isRecording}
          pointerSupported={POINTER_SUPPORTED}
          onRecordPointerDown={onRecordPointerDown}
          onRecordPointerUp={onRecordPointerUp}
          onRecordPointerCancel={onRecordPointerCancel}
          onRecordClickFallback={() => {
            if (POINTER_SUPPORTED) return;
            if (isRecording) stopRecording();
            else startRecording();
          }}
          groupMode={groupMode}
          speakerName={speakerName}
          onChangeSpeakerName={setSpeakerName}
          questionPriority={questionPriority}
          onChangeQuestionPriority={setQuestionPriority}
          inputText={inputText}
          onChangeInputText={setInputText}
          inputElRef={inputElRef}
          questionQueueLength={(questionQueue || []).length}
          onInterrupt={() => interruptCurrentRun('user_stop')}
          interruptDisabled={
            !isLoading && !((ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false) || currentAudioRef.current)
          }
          useAgentMode={useAgentMode}
          selectedAgentId={selectedAgentId}
          onSubmit={handleTextSubmit}
          onStartTour={startTour}
          onContinueTour={continueTour}
          onNextTourStop={nextTourStop}
          onPrevTourStop={prevTourStop}
          onSubmitTextAuto={submitTextAuto}
          focusInput={() => {
            try {
              setTimeout(() => {
                if (inputElRef.current && typeof inputElRef.current.focus === 'function') {
                  inputElRef.current.focus();
                }
              }, 0);
            } catch (_) {
              // ignore
            }
          }}
        />

        <div className="layout">
          <HistoryPanel
            historySort={historySort}
            onChangeSort={(v) => setHistorySort(v)}
            items={historyItems}
            onPickQuestion={(q) => {
              setInputText(q);
              try {
                setTimeout(() => {
                  if (inputElRef.current && typeof inputElRef.current.focus === 'function') {
                    inputElRef.current.focus();
                  }
                }, 0);
              } catch (_) {
                // ignore
              }
            }}
          />

          <ChatPanel
            lastQuestion={lastQuestion}
            answer={answer}
            isLoading={isLoading}
            queueStatus={queueStatus}
            messagesEndRef={messagesEndRef}
          />

          <DebugPanel
            debugInfo={debugInfo}
            ttsEnabled={ttsEnabled}
            tourState={tourState}
            serverStatus={serverStatus}
            serverStatusErr={serverStatusErr}
            serverEvents={serverEvents}
            serverEventsErr={serverEventsErr}
            serverLastError={serverLastError}
            questionQueue={questionQueue}
            onAnswerQueuedNow={(item) => answerQueuedNow(item)}
            onRemoveQueuedQuestion={(id) => removeQueuedQuestion(id)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
