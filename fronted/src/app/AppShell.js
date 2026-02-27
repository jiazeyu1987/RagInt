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
import { HomeStatusBar } from '../components/HomeStatusBar';
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
  const [answerCacheMeta, setAnswerCacheMeta] = useState({ hit: false, type: '' });
  const [qaCacheDebug, setQaCacheDebug] = useState(null);
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
    tourGuideTemplates,
    setTourGuideTemplates,
    tourGuideTemplateId,
    setTourGuideTemplateId,
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
  const [selectedChat, setSelectedChat] = useState('\u5c55\u5385\u804a\u5929');
  const [agentOptions, setAgentOptions] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [useAgentMode, setUseAgentMode] = useState(false);
  const { options: tourRecordingOptions, refresh: refreshTourRecordingOptions } = useTourRecordingOptions({
    enabled: true,
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
      fetchConcurrency: ttsFetchConcurrency,
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

  // TTS婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柛娑橈攻閸欏繘鏌ｉ幋婵愭綗闁逞屽墮閸婂潡骞愭繝鍐彾闁冲搫顑囩粔顔锯偓瑙勬磸閸旀垵顕ｉ崼鏇炵闁绘瑥鎳愰獮銏ゆ⒒閸屾瑧顦﹂柟娴嬪墲缁楃喎螖閸涱厾鐓戦柟鍏肩暘閸斿秹宕戦崟顖涚厱闁斥晛鍘鹃懖鈺傚床闁糕剝菧娴滄粓鏌″鍐ㄥ闁汇劍鍨堕幈銊╂晲閸パ傛闂佸搫鏈粙鎾诲焵椤掑﹦绉甸柛瀣噽娴滄悂顢橀悢缈犵盎濡炪倖鍔х徊璺ㄧ不閻愮儤鐓欐い鏃傛嚀婢ф煡鏌熼娑欘棃濠殿喒鍋撻梺闈涚箳婵绮旈悽鍛娾拻濞达絿鐡旈崵娆撴倵濞戞帗娅婃い銏＄懇瀵粙顢橀悙鐑橈紬婵＄偑鍊栧ú宥夊磻閹惧灈鍋撶憴鍕闁搞劌澧庨幑銏犫攽鐎ｎ亞鍊為梺瀹犳〃閼冲爼濡堕敂鐣岀瘈缁剧増蓱椤﹪鏌涢妸銈呭祮鐎规洏鍎抽埀顒婄秵閸忔﹢宕戦幘鎰佹僵妞ゆ挾鍋涢幗鐢告⒑閸濆嫯顫﹂柛濠冾殜瀹曠増绻濋崶褏顢呴梺缁樺姈缁佹挳骞忔繝姘拻濞达絽鎲￠崯鐐烘煠瑜版帞鐣烘鐐诧工铻ｅ〒姘煎灡缂嶅海绱撻崒娆戝妽閽冨崬鈹戦娑欏唉闁哄本绋戦埥澶婎潨閸儳鍙嶇紓浣鸿檸閸樻悂宕戦幘瀵哥瘈闁汇垽娼цⅴ闂佺懓鍢查崯鏉戠暦閻旂厧鍨傛い鎰╁€栧▓钘夆攽閿涘嫬浜奸柛濞垮€濆畷銏＄附閸涘﹤鈧埖绻濋棃娑冲姛濞存粈绮欏缁樻媴娓氼垳鍔哥紓浣虹帛閸旀瑥鐣烽妷褉鍋撻敐搴濈按闁哄鏌ㄩ湁闁绘挸娴烽幗鐘绘煕婵犲嫭鏆柟顔煎槻閳诲氦绠涢幙鍐х棯缂傚倷璁查崑鎾绘煃瑜滈崜娆撳煘閹达附鍊烽柤纰卞墯閸曢箖姊洪崨濠冪叆閻庢稈鏅濈划?
  const MAX_PRE_GENERATE_COUNT = 2; // 闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁惧墽鎳撻—鍐偓锝庝簼閹癸綁鏌ｉ鐐搭棞闁靛棙甯掗～婵嬫晲閸涱剙顥氬┑掳鍊楁慨鐑藉磻閻愮儤鍋嬮柣妯荤湽閳ь兛绶氬鎾閳╁啯鐝曢梻浣藉Г閿氭い锔诲枤缁辨棃寮撮姀鈾€鎷绘繛杈剧到閹诧繝宕悙鐑樼厱闁哄啯鎸鹃悾鐢碘偓瑙勬磻閸楀啿顕ｆ禒瀣垫晝闁靛繆鏅滈ˉ鈥斥攽閻樺灚鏆╁┑顔炬暩閸犲﹤顓兼径瀣簵濠电偛妫欓幐濠氭偂閻斿吋鐓欏ù鐓庣摠濞懷冾熆瑜滈崰鏍€﹂懗顖ｆ闂佹悶鍔岄悥鐓庮嚕婵犳碍鏅插璺猴攻椤ユ繈姊洪崷顓х劸閻庡灚甯掕灋闁挎洖鍊归埛鎴︽煕濠靛棗顏い顐畵閺屾稒绻濋崘顏嗙杽闂佺粯渚楅崳锝咁嚕娴犲惟闁挎洍鍋撴い搴㈡崌閺岋綁鎮㈤崫銉﹀櫑闁诲孩鐭崡鍐差嚕椤愶富鏁傞柛顐ゅ暱閹风粯绻涙潏鍓у埌闁硅绻濆畷顖炴倷閻㈢數锛滈柣鐘叉处瑜板啴顢旈鐘亾鐟欏嫭绀冩繛鑼枑娣囧﹪鎳滈棃娑氱獮婵犵數鍎愬浣虹不閹捐钃熸繛鎴欏灩閸楁娊鏌曟繛鍨姢濞寸媭鍙冨娲传閸曨剙娅ら梺缁樻惈缁绘繂顕ｇ拠娴嬫婵﹩鍋呴崟鍐⒑閸涘﹥瀵欓柍褜鍓氶幈銊╁炊椤掍讲鎷虹紓鍌欑劍椤洨绮婚弽顐熷亾閸忓浜剧紓浣割儐椤戞瑥顭囬弽顓熺叄闊洦鍑瑰鎰版倵濮橆厼鍝洪柡灞界Ч婵＄兘濡搁敂鎯ф锭闂備浇顕х换鎰涘☉姘潟闁规儳顕悷褰掓煕閵夋垵瀚禍鍫曟⒒娴ｈ棄鍚归柛鐔锋健瀵煡鎮╃紒妯轰粧濡炪倖娲嶉崑鎾垛偓瑙勬礃閿曘垽銆佸▎鎴濇瀳閺夊牄鍔庣粔閬嶆⒒閸屾瑧绐旀繛浣冲懏宕查柛顐犲劚閸ㄥ倸鈹戦悩宕囶暡闁稿鍊块弻鐔煎礈瑜忕敮娑㈡煟閹捐泛鏋涢柡宀嬬到铻ｉ柛婵嗗缁楊參姊洪悡搴☆棌濞存粠浜璇测槈閵忕姵顥濆┑鐐叉閸庢娊宕滄导瀛樷拻?濠电姷鏁告慨鐑藉极閸涘﹥鍙忛柣鎴ｆ閺嬩線鏌涘☉姗堟敾闁告瑥绻橀弻锝夊箣閿濆棭妫勯梺鍝勵儎缁舵岸寮婚悢鍏尖拻閻庨潧澹婂Σ顔剧磼閹冣挃缂侇噮鍨抽幑銏犫槈閵忕姷顓哄┑鐐叉缁绘帗绂掓ィ鍐┾拺缂佸顑欓崕蹇斻亜閹存繍妯€闁诡噯绻濋、鏇㈡晝閳ь剟鎮欐繝鍥ㄧ厪濠电倯鈧崑鎾翠繆閹绘帞澧︽慨濠冩そ瀹曨偊宕熼棃娑樺缂傚倷璁查崑鎾炽€掑锝呬壕闂佺硶鏅濋崑銈夌嵁鐎ｎ喗鏅滈柦妯侯槷濮规鏌ｆ惔銈庢綈婵炲弶鐗曢湁闁稿瞼鍋涘Ч鏌ユ煥閻斿搫校闁抽攱鍨圭槐鎺斺偓锝庡亽閸庛儵鏌涙惔锛勭闁哄本绋掔换婵嬪磼濞戞ü娣柣搴㈩問閸犳牠鈥﹂柨瀣╃箚闁兼悂娼х欢鐐测攽閻樿精鍏岄柣鎰躬濮婄粯绗熼埀顒€顭囪钘濆ù鐘差儏缁愭淇婇妶鍌氫壕闂佸磭绮幑鍥嵁瀹ュ鏁婇柛鎾楀秶闂?

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
    const next = window.prompt('闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧湱鈧懓瀚崳纾嬨亹閹烘垹鍊為悷婊冪箻瀵娊鏁冮崒娑氬幈濡炪値鍘介崹鍨濠靛鐓曟繛鍡楃箳缁犲鏌＄仦绋垮⒉鐎垫澘瀚埀顒婄秵娴滄繈顢欓崨顓涙斀闁绘劕寮堕埢鏇灻瑰鍕煁闁稿寒鍋婂缁樻媴閸濄儲鐎┑鈩冦仠閸斿矂婀侀梺鎼炲労閸撴瑧绮诲ú顏呯厸闁搞儮鏅涢弸鏃傜磼閳锯偓閸嬫捇姊绘笟鈧褎顨ヨ箛鏇炵筏闁告挆鍕幑婵°倧绲介崯顖炴偂濞戙垺鐓曟い鎰靛亜娴滄粌顭胯閻°劑濡甸崟顖氼潊闁斥晛鍟伴ˇ浼存⒑閻熸壆锛嶉柛瀣ㄥ€栨穱濠囨倻閼恒儲娅滈梺鍛婃处閸樻儳鈻旈崸妤佲拻闁稿本鐟︾粊鐗堛亜椤愩埄妯€鐎规洘娲熷畷姗€鎳犻浣诡啎婵＄偑鍊栫敮鎺斺偓姘煎弮瀹曟劙宕奸弴鐔哄帗闂佸憡绻傜€氼剟寮抽悢铏规／闁诡垎浣镐划闂佸搫鑻粔鐑铰ㄦ笟鈧弻娑㈠箻鐠虹儤鐎婚梺浼欑悼閸忔﹢鐛幒鎳虫梹鎷呯化鏇炰壕闁绘垼濮ら崐鐢告煟閵忊槅鍟忛柣鎺楃畺閹粙顢涘☉妯哄Б闂佸疇顫夐崹鍧楀箖閳哄拋鏁婇柤娴嬫櫃缁辨ɑ绻濋悽闈涗粶妞わ缚鍗抽幆鍕敍閻愯尙鐣洪悷婊勬煥閻ｇ兘宕￠悙鈺傤潔濠碘槅鍨抽埛鍫澪ｉ悜鑺モ拻濞撴埃鍋撴繛浣冲洦鍋嬮柛鈩冭泲閸ャ劌顕遍悗娑櫭禍妤€鈹戦悙鍙夘棡闁圭顭烽幃锟犳偄閸忚偐鍙嗗┑鐘绘涧濡瑩宕甸埀顒勬煟鎼淬垻鐓柛妤€鍟块锝嗙鐎ｎ亞鍔撮梺鍛婂姦娴滅偤顢欓弴銏♀拺闁圭娴风粻鎾绘煙閸愯尙绠绘鐐寸墵楠炲洭鎮ч崼銏犲汲闂備礁鎼ú锕傛晪闂侀€炲苯澧柣鈺婂灦楠炲啫顫滈埀顒€鐣峰鈧、娆撴偩鐏炶棄绠洪梻浣烘嚀閸氬骞嗗畝鍕瀭鐎规洖娲ㄩ惌鎾绘煟閵忕姵鍟為柣鎾存礋閺岀喖骞嗚閸ょ喖鏌熼崘鍙夊窛闁逞屽墲椤煤閺嶎厼绠规い鎰堕檮閸嬧晜绻濋棃娑卞剰缂佲偓鐎ｎ偁浜滈柟杈剧到琚氶柣搴㈣壘閵堢顫忓ú顏呭殥闁靛牆鎲涢姀锛勭闁肩⒈鍓欓埢鍫ユ煕閳规儳浜炬俊鐐€栫敮鎺楀疮椤栫偞鍋熸い蹇撶墛閻撶喖鐓崶銊﹀暗鐎涙繈姊虹€圭媭娼愰柛銊ユ健楠炲啫鈻庨幘宕囶唽闂佸湱鍎ゅΛ鍐偘閹惧墎纾介柛灞剧懅鐠愪即鏌涢悩宕囧⒌闁哄苯锕弫鎰板川椤栨稒顔?, '') || '';
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
    const ok = window.confirm('缂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻锝夊箣閿濆憛鎾绘煕閵堝懎顏柡灞剧洴椤㈡洟鏁愰崱娆樻О闂備浇顕栭崹鎶藉磻閵堝宓侀柡宥庣仈鎼搭煈鏁嗛柍褜鍓氭穱濠冪附閸涘﹦鍘藉銈嗘尵閸ｃ儱鈻撳鍕垫闁绘劕顕晶顏堟嚕閹邦厹浜滈柟鍝勬娴滅偓绻濆鏋€曟禍鍦磼鏉堛劌娴鐐叉喘椤㈡顦抽柣锝夘棑缁辨挻鎷呴搹鐟扮闂佺儵鏅╅崹鍫曟偘椤旈敮鍋撻敐搴濈按闁哄閰ｉ悡顐﹀炊閵婏妇顦ユ繝娈垮枛閻栫厧顫忕紒妯诲闁兼亽鍎埀顒€鍟扮槐鎺楀焵椤掍焦濯撮悹鍥ュ劜濡炶姤淇婇懜闈涚窞濠电姴瀚獮瀣⒒娴ｄ警鏀伴柟娲讳邯濮婁粙宕熼姘憋紱闂佽澹嗘晶妤呭磹閻㈠憡鐓曢柨鏃囶嚙楠炴牜鈧稒绻傞—鍐Χ閸愩劌濮曠紓浣筋嚙鐎氼喖危閹版澘绠婚悗娑櫭鎾绘⒑閸︻厾甯涢悽顖氾攻缁旂喖寮撮姀鈾€鎷绘繛杈剧秬濞咃綁濡存繝鍥ㄧ厱闁规儳顕粻妯肩磼椤旂晫鎳囨鐐村笒铻栧ù锝夋櫜缁ㄧ敻姊绘担铏瑰笡婵☆偄鍟村鏌ユ嚑椤掍礁搴婇梺绯曞墲鑿уù婊勭矒閺屸€愁吋閸愩劌顬嬬紓浣哄У閹告悂婀佸┑鐘诧工閸熸壆绮斿ú顏呯厵妞ゆ棁宕甸惌娆愩亜閵忥紕鈽夐柍钘夘槸椤繈顢橀悙鑼画闂傚倸鍊风粈渚€骞栭锔藉剹濠㈣泛鑻欢銈吤归悩宸剰闁绘挻锕㈤弻鐔告綇閸撗呮殸闂備礁宕ú锔炬崲濠靛顥堟繛鎴炵懃缁愭稒绻涚€涙鐭ゅù婊庝簻椤繒绱掑Ο璇差€撶紓浣圭☉椤戝懎鈻撻幇鐗堚拺闁告縿鍎辨牎闂佺粯顨嗙划搴∥ｉ幇鐗堝€烽悗闈涙憸閻﹀牓姊虹粙鎸庢拱缂侇喖绉撮埢鎾淬偅閸愨斁鎷洪梺鍛婃尰瑜板啯绂嶅┑鍥╃闁告瑥顦辨晶顏堟煛娓氬洤娅嶆慨濠勭帛缁楃喖鍩€椤掆偓椤洩顦归挊婵囥亜閹惧崬鐏╃痪鎯ф健濮婃椽顢楅埀顒傜矙閸曨厾绀婇柡宥庡幗閻撴瑩鏌涢幘妤€鎳庣粭锟犳⒑閹惰姤鏁遍悽顖涘浮濠€渚€姊洪幐搴ｇ畵闁瑰啿閰ｈ棢闊洦绋掗悡鏇熸叏濮楀棗骞楁い銉ョ墦閺岋紕浠︾粙鍨拤閻庡灚婢樼€氼厾鎹㈠┑瀣妞ゅ繐娲﹂妤€鈹戦敍鍕杭闁稿鍊濆畷婊冣枎閹炬潙浜遍梺绯曞墲缁嬪牓鍩€椤掍焦顥堢€规洘锕㈤、娆撳床婢诡垰娲﹂悡鏇㈡倶閻愭彃鈷旈柍顖涙礋閺岋絽鈹戦崶顭戞濠殿喖锕ュ钘壩涢崘銊㈡婵﹩鍓﹂弶鎼佹⒒娴ｇ瓔鍤冮柛鐘崇墵瀹曟劙骞栨笟鍥ㄦ櫔闂佹寧绻傞ˇ浠嬪极閸愵喗鐓ラ柡鍥殔娴滃墽绱撴担鍝勑ｇ紒瀣浮婵＄敻宕熼姘敤闂侀潧臎閸涱垰甯撻梻鍌欑閹碱偊藝娴兼潙绠栭柛灞惧嚬濞兼牗绻涘顔荤盎濞磋偐濞€閺屾盯寮撮妸銉ヮ潻缂備焦鍔栭惄顖氼潖閾忓湱鐭欐繛鍡樺劤閸撴娊姊虹粙娆惧剭闁稿﹥娲熼幃楣冩倻閽樺宓嗛梺闈涚箚閺呮粓寮插鍫熲拺闁告挻褰冩禍鐐烘煕閻旈攱鍋ユ鐐茬箳缁辨帒螣閼测晩鍟庨梺鍝勵槸閻楀棙鏅舵禒瀣濞寸厧鐡ㄩ悡娆撴偣閸ュ洤鎳愰惁鍫ユ倵鐟欏嫭澶勯柛銊ョ埣楠炲啫鈻庨幘鏉戔偓缁樹繆椤栨繃銆冪紓鍌涙尰娣囧﹪鎮欓鍕ㄥ亾閺嶎厽鍋嬫俊銈呭暙閸ㄦ繈鎮橀悙鎻掆挃妞も晝鍏橀弻銊╁棘閸喒鎸冪紒鐐礃閸嬫劗妲愰幘瀛樺閻犲浄绱曢崝宄扳攽閻愭彃绾ч柟鍛婂▕瀵鈽夐姀鐘靛幋闂佽鍨庨崒姘兼濠电姷顣槐鏇㈠磻閹达箑纾归柡宥庡亝閺嗘粌鈹戦悩鍙夊闁搞倕瀚伴弻娑㈠箻閼艰泛鍘℃繛鎴炴尭缁夌鐏冮梺鎸庣箓閹冲酣寮抽悙鐑樼厽闁规儳鐡ㄧ粈鍐磼缂佹娲存鐐差儏閳规垿宕卞顒傚幋闂佽瀛╅鏍闯椤曗偓瀹曟娊鏁愭径濠呮憰濠电偞鍨惰彜闁哄閰ｉ悡顐﹀炊閵婏附鍎庢繛鏉戠毞閸嬫捇姊婚崒娆戠獢闁逞屽墰閸嬫盯鎳熼娑欐珷闁告瑥顦禍婊勩亜閹扳晛鐒烘俊鍙夋倐閹繝濡舵径灞藉絼闂佹悶鍎崝搴ㄥ煡婢跺瞼妫柟顖嗗嫬浠撮梺鍝勭焿缁辨洘绂掗敂鐐珰闁圭粯甯掗～鎾剁磽閸屾瑨鍏屽┑顕€娼ч悾婵嬪箹娴ｆ瓕鎽曢梺璺ㄥ枔婵绮堥崘顔界厪濠电倯鍐ㄦ灓闁哄棭鍋呮穱濠囨倷椤忓嫧鍋撻妶澶婄；闁告洦鍨扮粻鐘虫叏濡炶浜鹃悗娈垮枦椤曆囶敇閸忕厧绶為悗锝庝簽濡绢喖鈹戦悩顔肩伇婵炲鐩、鏍川椤撴稒鐏佸┑掳鍊曢幊蹇涘煕閹寸姷纾藉ù锝堫嚃閻掍粙鏌嶉娑欑缂佽鲸甯￠、娆撴嚃閳诡兙鍊濋弻鐔肩嵁閸喚浠奸梺瀹狀潐閸ㄥ綊鍩€椤掑﹦绉甸柛瀣缁傛帒煤椤忓應鎷婚梺绋挎湰濮樸劍鏅跺☉姘辩＜閻庯綆鍋勬慨澶愭煕閹烘挸绗ч柟鐟板缁楃喖顢涘☉妯兼В闂傚倷绶氬褔鎮ч崱娆愬床婵☆垯璀﹂悗鑸点亜閺冨倹娅曠紒鈾€鍋撻梻渚€娼х换鍡椢ｉ崨瀛樺€垮ù鐘差儐閻撴洘绻涢崱妤冪闁革絽缍婇弻宥囨喆閸曨偆浼岄梺绯曟杺閸庨潧鐣烽崡鐐嶆棃宕樿濡﹪姊虹拠鍙夊攭妞ゎ偄顦叅婵犲﹤鐗嗛弸浣糕攽閻樺疇澹樻潻婵嬫⒑閸涘﹦鈽夐柣掳鍔戦幃锟犲Ψ閳哄倸鈧敻鏌ㄥ┑鍡楁殭濠德ゆ缁辨帡濡搁妷顔惧悑濠殿喖锕ュ钘夌暦椤愶箑绀嬫い鎰剁稻椤斿嫭绻濋悽闈涗哗妞ゆ洘绮庣划濠氬箻鐟欏嫸绱撴繝鐢靛О閸ㄧ厧鈻斿☉銏″剶闁兼祴鏅涢ˉ姘攽閸屾碍鍟為柣鎾存礋閺岀喖骞戦幇顒傛濡炪倧璁ｇ粻鎴︽箒闂佺粯蓱閻熴儱煤閿曞倹鍋傞柛鎰典簼閸犳劖绻濇繝鍌滃缂佲偓閸喓绠鹃柛鈩兠悘鈺佲槈閹惧磭肖闁逞屽墮缁犲秹宕曢柆宓ュ洭顢涘鍐炬闂佺鍕垫畷闁抽攱鍨堕妵鍕箳閸℃ぞ澹曠紓鍌欑椤︿即骞愰幎钘夌畺闁秆勵殢閺佸鏌嶈閸撶喎顕ｆ繝姘櫜闁告稑鍊婚崰搴ㄥ煝鎼淬劌绠氱憸搴敊閸曨厾纾?);
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
    setAnswerCacheMeta({ hit: false, type: '' });
    setQaCacheDebug(null);
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
    tourState,
    currentIntent,
    tourStops,
    tourStopDurations,
    tourStopDurationsOverride,
    setTourStopDurationsOverride,
    tourSelectedStopIndex,
    setTourSelectedStopIndex,
    jumpTourStop,
    resetTour,
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

  const guideTemplateList = Array.isArray(tourGuideTemplates) ? tourGuideTemplates : [];
  const selectedGuideTemplate =
    guideTemplateList.find((tpl) => String((tpl && tpl.id) || '').trim() === String(tourGuideTemplateId || '').trim()) ||
    guideTemplateList[0] ||
    null;
  const currentTemplateName = String(
    (selectedGuideTemplate && (selectedGuideTemplate.name || selectedGuideTemplate.id)) || '未设置'
  );
  const templateOrderedStops =
    selectedGuideTemplate && Array.isArray(selectedGuideTemplate.stops)
      ? selectedGuideTemplate.stops
          .filter((row) => row && row.enabled !== false)
          .map((row) => String((row && row.name) || '').trim())
          .filter(Boolean)
      : [];

  let currentModeLabel = '实时讲解';
  if (playTourRecordingEnabled) currentModeLabel = '播放存档';
  else if (tourRecordingEnabled) currentModeLabel = '录制讲解';

  const currentStopIndexFromState =
    tourState && Number.isFinite(tourState.stopIndex) && Number(tourState.stopIndex) >= 0
      ? Number(tourState.stopIndex)
      : Number.isFinite(Number(tourSelectedStopIndex))
      ? Number(tourSelectedStopIndex)
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
      ? '第' + (displayStopIndex + 1) + '站' + (currentStopName ? (' ' + currentStopName) : '')
      : '未开始';
  const wakeWordLabel = wakeWordEnabled ? String(wakeWord || '').trim() || '未设置' : '未启用';
  const audienceProfileLabel = String(audienceProfile || '').trim() || '未设置';

    return (
    <div className="app">
      <div className="container">
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
            />
          </div>

          <div className="center-pane">
            <HomeStatusBar
              modeLabel={currentModeLabel}
              templateName={currentTemplateName}
              audienceProfile={audienceProfileLabel}
              wakeWordLabel={wakeWordLabel}
              currentStopLabel={currentStopLabel}
            />

            <MainLayout
              showHistoryPanel={showHistoryPanel}
              historySort={historySort}
              onChangeHistorySort={onChangeHistorySort}
              historyItems={historyItems}
              onPickHistoryQuestion={onPickHistoryQuestion}
              lastQuestion={lastQuestion}
              answer={answer}
              answerCacheMeta={answerCacheMeta}
              qaCacheDebug={qaCacheDebug}
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
          </div>
        </div>

        <InputSection
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
