import {
  TOUR_BTN_MODE,
  UI_VIEW_MODE_STORAGE_KEY,
  cloneAsrProbeState,
  createInitialAsrProbeState,
  hasTourEntryParam,
  normalizeUiViewMode,
  readInitialUiViewMode,
  reduceTourButtonState,
  buildSendButtonClassName,
  buildSubmitDisabled,
  buildTourToggleViewModel,
  buildRunActiveForBargeIn,
  canAutoResumeTourState,
  isRecentAsrInput,
  shouldAutoResumeTourState,
  trimText,
} from './appShellState';

describe('appShellState helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    jest.restoreAllMocks();
  });

  test('normalizes text and UI view mode values', () => {
    expect(trimText(null)).toBe('');
    expect(trimText('  hello  ')).toBe('hello');
    expect(normalizeUiViewMode('simple')).toBe('simple');
    expect(normalizeUiViewMode(' full ')).toBe('full');
    expect(normalizeUiViewMode('unknown')).toBe('full');
  });

  test('detects tour entry param and resolves initial UI mode', () => {
    expect(readInitialUiViewMode()).toBe('full');

    window.localStorage.setItem(UI_VIEW_MODE_STORAGE_KEY, 'simple');
    expect(hasTourEntryParam()).toBe(false);
    expect(readInitialUiViewMode()).toBe('simple');

    window.history.replaceState({}, '', '/ragint/?entry=tour');
    window.localStorage.setItem(UI_VIEW_MODE_STORAGE_KEY, 'full');
    expect(hasTourEntryParam()).toBe(true);
    expect(readInitialUiViewMode()).toBe('simple');
  });

  test('throws when UI view mode storage cannot be read', () => {
    const storageError = new Error('storage_denied');
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw storageError;
    });

    expect(() => readInitialUiViewMode()).toThrow('Failed to read UI view mode from localStorage');
  });

  test('throws when stored UI view mode violates the schema', () => {
    window.localStorage.setItem(UI_VIEW_MODE_STORAGE_KEY, 'compact');

    expect(() => readInitialUiViewMode()).toThrow('Invalid stored UI view mode: compact');
  });

  test('throws when tour entry parameter parsing fails', () => {
    const OriginalURLSearchParams = URLSearchParams;
    global.URLSearchParams = jest.fn(() => {
      throw new Error('bad_search');
    });

    try {
      expect(() => hasTourEntryParam()).toThrow('Failed to read tour entry parameter');
    } finally {
      global.URLSearchParams = OriginalURLSearchParams;
    }
  });

  test('reduces tour button state transitions', () => {
    expect(reduceTourButtonState({ started: false, mode: TOUR_BTN_MODE.START }, { type: 'START_CLICK' })).toEqual({
      started: true,
      mode: TOUR_BTN_MODE.INTERRUPT,
    });
    expect(reduceTourButtonState({ started: true, mode: TOUR_BTN_MODE.INTERRUPT }, { type: 'INTERRUPT_CLICK' })).toEqual({
      started: true,
      mode: TOUR_BTN_MODE.CONTINUE,
    });
    expect(reduceTourButtonState({ started: true, mode: TOUR_BTN_MODE.CONTINUE }, { type: 'CONTINUE_CLICK' })).toEqual({
      started: true,
      mode: TOUR_BTN_MODE.INTERRUPT,
    });
    expect(reduceTourButtonState({ started: true, mode: TOUR_BTN_MODE.CONTINUE }, { type: 'RESET' })).toEqual({
      started: false,
      mode: TOUR_BTN_MODE.START,
    });
  });

  test('builds tour toggle and send button view models', () => {
    expect(
      buildTourToggleViewModel({
        tourButtonState: { started: true, mode: TOUR_BTN_MODE.INTERRUPT },
        interruptDisabled: true,
        ragflowUnavailable: false,
      })
    ).toEqual({
      label: '打断',
      danger: true,
      disabled: true,
    });
    expect(
      buildTourToggleViewModel({
        tourButtonState: { started: true, mode: TOUR_BTN_MODE.CONTINUE },
        interruptDisabled: true,
        ragflowUnavailable: true,
      })
    ).toEqual({
      label: '继续讲解',
      danger: false,
      disabled: true,
    });
    expect(buildTourToggleViewModel({ tourButtonState: { mode: TOUR_BTN_MODE.START } }).label).toBe('开始讲解');

    expect(buildSendButtonClassName({ playTourRecordingEnabled: true, tourRecordingEnabled: true })).toBe(
      'submit-btn submit-btn-playback'
    );
    expect(buildSendButtonClassName({ playTourRecordingEnabled: false, tourRecordingEnabled: true })).toBe(
      'submit-btn submit-btn-recording'
    );
    expect(buildSendButtonClassName({})).toBe('submit-btn submit-btn-normal');
  });

  test('builds submit disabled state', () => {
    expect(
      buildSubmitDisabled({
        isRecording: true,
        inputText: 'question',
        useAgentMode: false,
        selectedAgentId: '',
        ragflowUnavailable: false,
      })
    ).toBe(true);
    expect(buildSubmitDisabled({ inputText: '   ', ragflowUnavailable: false })).toBe(true);
    expect(buildSubmitDisabled({ inputText: 'question', useAgentMode: true, selectedAgentId: '' })).toBe(true);
    expect(
      buildSubmitDisabled({
        inputText: 'question',
        useAgentMode: true,
        selectedAgentId: 'agent-1',
        ragflowUnavailable: false,
      })
    ).toBe(false);
    expect(buildSubmitDisabled({ inputText: 'question', ragflowUnavailable: true })).toBe(true);
  });

  test('builds ASR barge-in and auto-resume decisions', () => {
    expect(buildRunActiveForBargeIn({ askActive: false, loading: false })).toBe(false);
    expect(buildRunActiveForBargeIn({ ttsBusy: true })).toBe(true);
    expect(buildRunActiveForBargeIn({ pipelineActive: true })).toBe(true);

    expect(canAutoResumeTourState({ mode: 'idle', stopIndex: 0 })).toBe(false);
    expect(canAutoResumeTourState({ mode: 'paused', stopIndex: -1 })).toBe(false);
    expect(canAutoResumeTourState({ mode: 'paused', stopIndex: 1 })).toBe(true);
    expect(shouldAutoResumeTourState({ tourState: { mode: 'running', stopIndex: 0 }, runActive: false })).toBe(true);
    expect(shouldAutoResumeTourState({ tourState: { mode: 'paused', stopIndex: 0 }, runActive: true })).toBe(true);
    expect(shouldAutoResumeTourState({ tourState: { mode: 'paused', stopIndex: 0 }, runActive: false })).toBe(false);

    expect(isRecentAsrInput({ lastChangeAtMs: Date.now() - 100, nowMs: Date.now(), windowMs: 700 })).toBe(true);
    expect(isRecentAsrInput({ lastChangeAtMs: Date.now() - 1000, nowMs: Date.now(), windowMs: 700 })).toBe(false);
  });

  test('creates and clones ASR probe state defensively', () => {
    const initial = createInitialAsrProbeState();
    expect(initial.recognitionStage).toBe('idle');
    expect(initial.asrPostProcessEvents).toEqual([]);

    const sourceEvent = { type: 'x', fields: { a: 1 } };
    const cloned = cloneAsrProbeState({
      lastFinalTextBeforePostProcess: 123,
      isRecording: 1,
      recognitionStage: '',
      asrPostProcessEvents: [sourceEvent],
      lastPostProcessResult: { ok: true },
    });

    expect(cloned.lastFinalTextBeforePostProcess).toBe('123');
    expect(cloned.isRecording).toBe(true);
    expect(cloned.recognitionStage).toBe('idle');
    expect(cloned.asrPostProcessEvents).toEqual([{ type: 'x', fields: { a: 1 } }]);
    expect(cloned.asrPostProcessEvents[0].fields).not.toBe(sourceEvent.fields);
    expect(cloned.lastPostProcessResult).toEqual({ ok: true });
  });
});
