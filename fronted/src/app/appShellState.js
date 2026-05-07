export const TOUR_BTN_MODE = {
  START: 'start',
  INTERRUPT: 'interrupt',
  CONTINUE: 'continue',
};

export const UI_VIEW_MODE_STORAGE_KEY = 'ragint_ui_view_mode_v1';
export const TOUR_RAGFLOW_CHAT_NAME = '\u5c55\u5385\u804a\u5929';
export const PREFERRED_TTS_SAMPLE_RATE = 16000;
export const MAX_PRE_GENERATE_COUNT = 2;

export function trimText(value) {
  return String(value == null ? '' : value).trim();
}

export function createInitialAnswerCacheMeta() {
  return { hit: false, type: '' };
}

export function createInitialTourButtonState() {
  return { started: false, mode: TOUR_BTN_MODE.START };
}

export function createInitialTourMeta() {
  return {
    zones: ['\u9ed8\u8ba4\u8def\u7ebf'],
    profiles: ['\u5927\u4f17', '\u513f\u7ae5', '\u4e13\u4e1a'],
    default_zone: '\u9ed8\u8ba4\u8def\u7ebf',
    default_profile: '\u5927\u4f17',
  };
}

export function isPointerEventSupported(windowLike = typeof window === 'undefined' ? null : window) {
  return !!(windowLike && 'PointerEvent' in windowLike);
}

export function createInitialAsrProbeState() {
  return {
    lastFinalTextBeforePostProcess: '',
    lastFinalReceivedAtMs: 0,
    lastInputTextFromAsr: '',
    lastInputTextFromAsrAtMs: 0,
    inputText: '',
    queueStatus: '',
    isRecording: false,
    isRecognizing: false,
    recognitionStage: 'idle',
    asrPostProcessStage: 'idle',
    asrPostProcessEvents: [],
    lastPostProcessResult: null,
    lastUpdatedAtMs: 0,
  };
}

export function cloneAsrProbeState(state) {
  const src = state && typeof state === 'object' ? state : createInitialAsrProbeState();
  return {
    lastFinalTextBeforePostProcess: String(src.lastFinalTextBeforePostProcess || ''),
    lastFinalReceivedAtMs: Number(src.lastFinalReceivedAtMs || 0),
    lastInputTextFromAsr: String(src.lastInputTextFromAsr || ''),
    lastInputTextFromAsrAtMs: Number(src.lastInputTextFromAsrAtMs || 0),
    inputText: String(src.inputText || ''),
    queueStatus: String(src.queueStatus || ''),
    isRecording: !!src.isRecording,
    isRecognizing: !!src.isRecognizing,
    recognitionStage: String(src.recognitionStage || 'idle'),
    asrPostProcessStage: String(src.asrPostProcessStage || 'idle'),
    asrPostProcessEvents: Array.isArray(src.asrPostProcessEvents)
      ? src.asrPostProcessEvents.map((event) => ({
          ...(event && typeof event === 'object' ? event : {}),
          fields:
            event && typeof event === 'object' && event.fields && typeof event.fields === 'object'
              ? { ...event.fields }
              : {},
        }))
      : [],
    lastPostProcessResult:
      src.lastPostProcessResult && typeof src.lastPostProcessResult === 'object'
        ? { ...src.lastPostProcessResult }
        : null,
    lastUpdatedAtMs: Number(src.lastUpdatedAtMs || 0),
  };
}

export function normalizeUiViewMode(value) {
  const mode = String(value || '').trim();
  return mode === 'simple' ? 'simple' : 'full';
}

function parseStoredUiViewMode(rawValue) {
  if (rawValue == null) return 'full';
  const mode = String(rawValue).trim();
  if (mode === 'simple' || mode === 'full') return mode;
  throw new Error(`Invalid stored UI view mode: ${mode}`);
}

export function hasTourEntryParam() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(String(window.location.search || ''));
    return params.get('entry') === 'tour';
  } catch (error) {
    throw new Error('Failed to read tour entry parameter', { cause: error });
  }
}

export function readInitialUiViewMode() {
  if (typeof window === 'undefined') return 'full';
  if (hasTourEntryParam()) return 'simple';
  if (!window.localStorage) return 'full';
  try {
    return parseStoredUiViewMode(window.localStorage.getItem(UI_VIEW_MODE_STORAGE_KEY));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid stored UI view mode:')) {
      throw error;
    }
    throw new Error('Failed to read UI view mode from localStorage', { cause: error });
  }
}

export function reduceTourButtonState(state, event) {
  const type = String((event && event.type) || '').trim();
  if (type === 'RESET') return createInitialTourButtonState();
  if (type === 'START_CLICK') return { started: true, mode: TOUR_BTN_MODE.INTERRUPT };
  if (type === 'INTERRUPT_CLICK') return state.started ? { ...state, mode: TOUR_BTN_MODE.CONTINUE } : state;
  if (type === 'CONTINUE_CLICK') return state.started ? { ...state, mode: TOUR_BTN_MODE.INTERRUPT } : state;
  if (type === 'PLAYBACK_STARTED') return state.started ? { ...state, mode: TOUR_BTN_MODE.INTERRUPT } : state;
  if (type === 'PLAYBACK_STOPPED') return state.started ? { ...state, mode: TOUR_BTN_MODE.CONTINUE } : state;
  return state;
}

export function buildTourToggleViewModel({
  tourButtonState = {},
  interruptDisabled = false,
  ragflowUnavailable = false,
} = {}) {
  const mode = String((tourButtonState && tourButtonState.mode) || TOUR_BTN_MODE.START);
  const interruptMode = mode === TOUR_BTN_MODE.INTERRUPT;
  return {
    label:
      mode === TOUR_BTN_MODE.INTERRUPT
        ? '\u6253\u65ad'
        : mode === TOUR_BTN_MODE.CONTINUE
          ? '\u7ee7\u7eed\u8bb2\u89e3'
          : '\u5f00\u59cb\u8bb2\u89e3',
    danger: interruptMode,
    disabled: interruptMode ? !!interruptDisabled : !!ragflowUnavailable,
  };
}

export function buildSendButtonClassName({ playTourRecordingEnabled = false, tourRecordingEnabled = false } = {}) {
  const sendMode = playTourRecordingEnabled ? 'playback' : tourRecordingEnabled ? 'recording' : 'normal';
  return `submit-btn submit-btn-${sendMode}`;
}

export function buildSubmitDisabled({
  isRecording = false,
  inputText = '',
  useAgentMode = false,
  selectedAgentId = '',
  ragflowUnavailable = false,
} = {}) {
  return (
    !!isRecording
    || !String(inputText || '').trim()
    || (!!useAgentMode && !String(selectedAgentId || '').trim())
    || !!ragflowUnavailable
  );
}

export function buildRunActiveForBargeIn({
  askActive = false,
  loading = false,
  audioActive = false,
  ttsBusy = false,
  pipelineActive = false,
} = {}) {
  return !!askActive || !!loading || !!audioActive || !!ttsBusy || !!pipelineActive;
}

export function canAutoResumeTourState(tourState) {
  const state = tourState && typeof tourState === 'object' ? tourState : null;
  if (!state) return false;
  if (String(state.mode || '') === 'idle') return false;
  return Number.isFinite(Number(state.stopIndex)) && Number(state.stopIndex) >= 0;
}

export function shouldAutoResumeTourState({ tourState = null, runActive = false } = {}) {
  if (!canAutoResumeTourState(tourState)) return false;
  const runningMode = String((tourState && tourState.mode) || '') === 'running';
  return runningMode || !!runActive;
}

export function isRecentAsrInput({ lastChangeAtMs = 0, nowMs = Date.now(), windowMs = 700 } = {}) {
  const lastChangeAt = Number(lastChangeAtMs || 0);
  if (!Number.isFinite(lastChangeAt) || lastChangeAt <= 0) return false;
  return Number(nowMs || 0) - lastChangeAt < Number(windowMs || 0);
}
