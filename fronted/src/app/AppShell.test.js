import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockOrchestrationSpies = {
  startTour: jest.fn().mockResolvedValue(undefined),
  continueTour: jest.fn().mockResolvedValue(undefined),
  resetTour: jest.fn().mockResolvedValue(undefined),
  onInterruptManual: jest.fn(),
  prevTourStop: jest.fn(),
  nextTourStop: jest.fn(),
  jumpTourStop: jest.fn(),
};

let mockLatestInputSectionProps = null;
let mockLatestStatusBarProps = null;
let mockAppSettingsOverride = null;
let mockTourRecordingOptionsOverride = null;

function mockBuildAppSettings() {
  return {
    ttsMode: 'modelscope',
    setTtsMode: jest.fn(),
    modelscopeVoice: '',
    setModelscopeVoice: jest.fn(),
    ttsSpeed: 1,
    setTtsSpeed: jest.fn(),
    ttsFetchConcurrency: 4,
    setTtsFetchConcurrency: jest.fn(),
    guideEnabled: true,
    setGuideEnabled: jest.fn(),
    continuousTour: false,
    setContinuousTour: jest.fn(),
    tourRecordingEnabled: false,
    setTourRecordingEnabled: jest.fn(),
    playTourRecordingEnabled: false,
    setPlayTourRecordingEnabled: jest.fn(),
    selectedTourRecordingId: '',
    setSelectedTourRecordingId: jest.fn(),
    guideDuration: '10',
    setGuideDuration: jest.fn(),
    guideStyle: 'friendly',
    setGuideStyle: jest.fn(),
    qaAnswerTargetChars: '10',
    setQaAnswerTargetChars: jest.fn(),
    qaAudioCacheLookupEnabled: true,
    setQaAudioCacheLookupEnabled: jest.fn(),
    qaAudioCacheConfidenceThreshold: '0.85',
    setQaAudioCacheConfidenceThreshold: jest.fn(),
    showHistoryPanel: false,
    setShowHistoryPanel: jest.fn(),
    showDebugPanel: false,
    setShowDebugPanel: jest.fn(),
    tourZone: '',
    setTourZone: jest.fn(),
    audienceProfile: 'General',
    setAudienceProfile: jest.fn(),
    groupMode: false,
    setGroupMode: jest.fn(),
    speakerName: 'speaker',
    setSpeakerName: jest.fn(),
    tourSelectedStopIndex: 0,
    setTourSelectedStopIndex: jest.fn(),
    tourTemplateId: '',
    tourStopsOverride: [],
    setTourStopsOverride: jest.fn(),
    tourStopDurationsOverride: {},
    setTourStopDurationsOverride: jest.fn(),
    tourStopPromptOverrides: {},
    setTourStopPromptOverrides: jest.fn(),
    tourGuideTemplates: [{ id: 'tpl-1', name: 'Template 1', stops: [{ name: 'Stop A', enabled: true }] }],
    setTourGuideTemplates: jest.fn(),
    tourGuideTemplateId: 'tpl-1',
    setTourGuideTemplateId: jest.fn(),
    tourStopDurationTemplateKey: 'tpl_1m',
    setTourStopDurationTemplateKey: jest.fn(),
    tourStopDurationTemplates: {},
    setTourStopDurationTemplates: jest.fn(),
    wakeWordEnabled: true,
    setWakeWordEnabled: jest.fn(),
    wakeWord: 'hello assistant',
    setWakeWord: jest.fn(),
    wakeWordCooldownMs: 5000,
    setWakeWordCooldownMs: jest.fn(),
    wakeWordStrict: false,
    setWakeWordStrict: jest.fn(),
    asrAutoSubmitOnWakeEnabled: true,
    setAsrAutoSubmitOnWakeEnabled: jest.fn(),
    asrAutoResumeAfterAnswerEnabled: true,
    setAsrAutoResumeAfterAnswerEnabled: jest.fn(),
    asrAutoResumeAfterAnswerDelayMs: 1200,
    setAsrAutoResumeAfterAnswerDelayMs: jest.fn(),
    asrConversationAutoSubmitSilenceMs: 1200,
    setAsrConversationAutoSubmitSilenceMs: jest.fn(),
    asrConversationAutoSubmitScope: 'voice_only',
    setAsrConversationAutoSubmitScope: jest.fn(),
    asrConversationContextStrategy: 'smart_recent_current',
    setAsrConversationContextStrategy: jest.fn(),
    asrConversationContextRecentTurns: 10,
    setAsrConversationContextRecentTurns: jest.fn(),
    asrConversationContextMaxTokens: 16000,
    setAsrConversationContextMaxTokens: jest.fn(),
    globalPromptPrefix: '',
    setGlobalPromptPrefix: jest.fn(),
    asrTextFilterEnabled: false,
    setAsrTextFilterEnabled: jest.fn(),
    asrTextFilterChatName: 'chat',
    setAsrTextFilterChatName: jest.fn(),
    asrTextFilterTerms: '',
    setAsrTextFilterTerms: jest.fn(),
    asrTextFilterPrompt: '',
    setAsrTextFilterPrompt: jest.fn(),
    settingsActiveTab: 'asr',
    setSettingsActiveTab: jest.fn(),
    asrMinRecordMs: 900,
    setAsrMinRecordMs: jest.fn(),
    asrStopGraceMs: 480,
    setAsrStopGraceMs: jest.fn(),
    asrFinalWaitMs: 1500,
    setAsrFinalWaitMs: jest.fn(),
    asrProviderType: 'voicekit_ws',
    setAsrProviderType: jest.fn(),
    asrFinalTimeoutStrategy: 'keep_partial',
    setAsrFinalTimeoutStrategy: jest.fn(),
    saucWsUrl: '',
    setSaucWsUrl: jest.fn(),
    saucResourceId: '',
    setSaucResourceId: jest.fn(),
    saucAppKey: '',
    setSaucAppKey: jest.fn(),
    saucAccessKey: '',
    setSaucAccessKey: jest.fn(),
    saucModelName: '',
    setSaucModelName: jest.fn(),
    saucSegmentDurationMs: 200,
    setSaucSegmentDurationMs: jest.fn(),
    saucEnableItn: true,
    setSaucEnableItn: jest.fn(),
    saucEnablePunc: true,
    setSaucEnablePunc: jest.fn(),
    saucEnableDdc: true,
    setSaucEnableDdc: jest.fn(),
    saucShowUtterances: true,
    setSaucShowUtterances: jest.fn(),
    saucEnableNonstream: false,
    setSaucEnableNonstream: jest.fn(),
  };
}

jest.mock('../audio/ttsAudio', () => ({
  decodeAndConvertToWav16kMono: jest.fn(),
  unlockAudio: jest.fn(),
}));

jest.mock('../api/backendClient', () => ({
  cancelRequest: jest.fn(),
  emitClientEvent: jest.fn(),
  fetchJson: jest.fn(),
  filterAsrText: jest.fn(),
}));

jest.mock('../managers/createTtsOnStopIndexChange', () => ({
  createTtsOnStopIndexChange: jest.fn(() => jest.fn()),
}));

jest.mock('../managers/createTtsManager', () => ({
  createOrGetTtsManager: jest.fn(() => ({
    isBusy: jest.fn(() => false),
    stop: jest.fn(),
    enqueueText: jest.fn(),
    enqueueAudioUrl: jest.fn(),
    ensureRunning: jest.fn(),
  })),
}));

jest.mock('../components/InputSection', () => ({
  InputSection: (props) => {
    mockLatestInputSectionProps = props;
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'input-section-mock' }, props.tourToggleLabel || '');
  },
}));

jest.mock('../components/SettingsPanel', () => ({
  SettingsPanel: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'settings-panel-mock' });
  },
}));

jest.mock('../components/MainLayout', () => ({
  MainLayout: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'main-layout-mock' });
  },
}));

jest.mock('../components/HomeStatusBar', () => ({
  HomeStatusBar: (props) => {
    mockLatestStatusBarProps = props;
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'status-bar-mock' });
  },
}));

jest.mock('../components/RightPanelTabs', () => ({
  RightPanelTabs: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'right-tabs-mock' });
  },
}));

jest.mock('../hooks/useBackendStatus', () => ({
  useBackendStatus: () => ({ status: 'ok', error: null }),
}));

jest.mock('../hooks/useBackendEvents', () => ({
  useBackendEvents: () => ({ items: [], lastError: null, error: null }),
}));

jest.mock('../hooks/useAppSettings', () => ({
  useAppSettings: () => mockAppSettingsOverride || mockBuildAppSettings(),
}));

jest.mock('../hooks/useClientId', () => ({
  useClientId: () => 'client-1',
}));

jest.mock('../hooks/useTourBootstrap', () => ({
  useTourBootstrap: () => {},
}));

jest.mock('../hooks/useRagflowBootstrap', () => ({
  useRagflowBootstrap: () => {},
}));

jest.mock('../hooks/useTourState', () => ({
  useTourState: () => [
    { mode: 'idle', stopIndex: -1, stopName: '', lastAction: null, lastAnswerTail: '' },
    jest.fn(),
  ],
}));

jest.mock('../hooks/useBreakpointSync', () => ({
  useBreakpointSync: () => {},
}));

const mockPipeline = {
  isActive: jest.fn(() => false),
  buildTourPrompt: jest.fn(() => 'prompt'),
  getPrefetch: jest.fn(() => null),
  prefetchFilter: jest.fn(() => Promise.resolve()),
  abortPrefetch: jest.fn(),
};

jest.mock('../hooks/useTourPipelineManager', () => ({
  useTourPipelineManager: () => ({
    tourPipelineRef: { current: mockPipeline },
    getTourPipeline: () => mockPipeline,
    abortPrefetch: jest.fn(),
  }),
}));

jest.mock('../hooks/useAskWorkflowManager', () => ({
  useAskWorkflowManager: () => ({
    interruptCurrentRun: jest.fn(),
    askQuestion: jest.fn().mockResolvedValue('ok'),
  }),
}));

jest.mock('../hooks/useHistoryPanel', () => ({
  useHistoryPanel: () => ({
    historySort: 'latest',
    setHistorySort: jest.fn(),
    historyItems: [],
    fetchHistory: jest.fn(),
  }),
}));

jest.mock('../hooks/useDebugRun', () => ({
  useDebugRun: () => ({
    debugInfo: {},
    debugRef: { current: null },
    beginDebugRun: jest.fn(),
    debugMark: jest.fn(),
    debugRefresh: jest.fn(),
  }),
}));

jest.mock('../hooks/useQueueStatusMonitor', () => ({
  useQueueStatusMonitor: () => ({ startStatusMonitor: jest.fn() }),
}));

jest.mock('../hooks/useVoiceConversationControls', () => ({
  useVoiceConversationControls: () => ({
    isRecording: false,
    isRecognizing: false,
    recognitionStage: 'idle',
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    onRecordPointerDown: jest.fn(),
    onRecordPointerUp: jest.fn(),
    onRecordPointerCancel: jest.fn(),
    conversationEnabled: false,
    conversationBusy: false,
    onToggleConversation: jest.fn(),
    handleTextSubmit: jest.fn(),
    submitTextAuto: jest.fn(),
  }),
}));

jest.mock('../hooks/useRunOrchestration', () => ({
  useRunOrchestration: () => ({
    getTourController: jest.fn(),
    getRunCoordinator: jest.fn(() => ({ interruptEscape: jest.fn() })),
    submitUserText: jest.fn(),
    startTour: mockOrchestrationSpies.startTour,
    continueTour: mockOrchestrationSpies.continueTour,
    prevTourStop: mockOrchestrationSpies.prevTourStop,
    nextTourStop: mockOrchestrationSpies.nextTourStop,
    jumpTourStop: mockOrchestrationSpies.jumpTourStop,
    resetTour: mockOrchestrationSpies.resetTour,
    onAnswerQueuedNow: jest.fn(),
    onRemoveQueuedQuestion: jest.fn(),
    onInterruptManual: mockOrchestrationSpies.onInterruptManual,
  }),
}));

jest.mock('../hooks/useStagePanelProps', () => ({
  useStagePanelProps: () => ({ stage: true }),
}));

jest.mock('../hooks/useControlBarProps', () => ({
  useControlBarProps: () => ({ control: true }),
}));

jest.mock('../hooks/useTourModePanelProps', () => ({
  useTourModePanelProps: () => ({ tourMode: true }),
}));

jest.mock('../hooks/useTextInputProps', () => ({
  useTextInputProps: () => ({ textInputProps: { inputText: '', onChangeInputText: jest.fn() } }),
}));

jest.mock('../hooks/useTtsUiSync', () => ({
  useTtsUiSync: () => {},
}));

jest.mock('../hooks/useStateRefsSync', () => ({
  useStateRefsSync: () => {},
}));

jest.mock('../hooks/useUiActions', () => ({
  useUiActions: () => ({
    onPickHistoryQuestion: jest.fn(),
    onQuickSummary: jest.fn(),
    onChangeHistorySort: jest.fn(),
  }),
}));

jest.mock('../hooks/useTourRecordingOptions', () => ({
  useTourRecordingOptions: () => mockTourRecordingOptionsOverride || { options: [], refresh: jest.fn(), ready: true },
}));

jest.mock('../hooks/useTourRecordings', () => ({
  useTourRecordings: () => ({
    startTourRecordingArchive: jest.fn(),
    finishTourRecordingArchive: jest.fn(),
    loadTourRecordingMeta: jest.fn(),
    renameSelectedTourRecording: jest.fn(),
    deleteSelectedTourRecording: jest.fn(),
  }),
}));

jest.mock('../config/backend', () => ({
  getBackendBase: jest.fn(() => ''),
}));

jest.mock('../api/tourCommand', () => ({
  parseTourCommand: jest.fn().mockResolvedValue(null),
}));

jest.mock('../voice/AsrPostProcessPipeline', () => {
  class AsrPostProcessPipelineMock {
    clearPendingAsrText() {}
    setPendingAsrText() {}
    getWakeHoldUntilMs() {
      return 0;
    }
    process() {
      return Promise.resolve({ accepted: true, text: '' });
    }
    prefetchFilter() {
      return Promise.resolve(undefined);
    }
  }
  return { AsrPostProcessPipeline: AsrPostProcessPipelineMock };
});

const AppShell = require('./AppShell').default;

function render(ui) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

describe('AppShell', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    mockLatestInputSectionProps = null;
    mockLatestStatusBarProps = null;
    mockAppSettingsOverride = null;
    mockTourRecordingOptionsOverride = null;
    mockOrchestrationSpies.startTour.mockClear();
    mockOrchestrationSpies.continueTour.mockClear();
    mockOrchestrationSpies.resetTour.mockClear();
    mockOrchestrationSpies.onInterruptManual.mockClear();
  });

  test('renders shell layout and forwards tour toggle/reset actions', async () => {
    const view = render(React.createElement(AppShell));

    expect(view.container.querySelector('[data-testid="input-section-mock"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="settings-panel-mock"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="main-layout-mock"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="right-tabs-mock"]')).toBeTruthy();
    expect(mockLatestInputSectionProps).toBeTruthy();
    expect(mockLatestStatusBarProps && mockLatestStatusBarProps.ragflowConversationLabel).toBe('\u5c55\u5385\u804a\u5929');

    await act(async () => {
      await mockLatestInputSectionProps.onTourToggle();
    });
    expect(mockOrchestrationSpies.startTour).toHaveBeenCalledTimes(1);
    expect(mockLatestStatusBarProps && mockLatestStatusBarProps.ragflowConversationLabel).toBe('\u5c55\u5385\u804a\u5929');

    await act(async () => {
      await mockLatestInputSectionProps.onReset();
    });
    expect(mockOrchestrationSpies.onInterruptManual).toHaveBeenCalledTimes(1);
    expect(mockOrchestrationSpies.resetTour).toHaveBeenCalledTimes(1);
    expect(mockLatestStatusBarProps && mockLatestStatusBarProps.ragflowConversationLabel).toBe('\u5c55\u5385\u804a\u5929');
    view.unmount();
  });

  test('switches between full ui and simple control page', async () => {
    const view = render(React.createElement(AppShell));

    expect(mockLatestInputSectionProps).toBeTruthy();
    expect(typeof mockLatestInputSectionProps.onBackToSimple).toBe('function');

    await act(async () => {
      await mockLatestInputSectionProps.onBackToSimple();
    });

    const mainBtn = view.container.querySelector('.simple-tour-main-btn');
    const titleBtn = view.container.querySelector('.simple-tour-title-btn');
    expect(mainBtn).toBeTruthy();
    expect(titleBtn).toBeTruthy();
    expect(window.localStorage.getItem('ragint_ui_view_mode_v1')).toBe('simple');

    await act(async () => {
      mainBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOrchestrationSpies.startTour).toHaveBeenCalledTimes(1);

    await act(async () => {
      mainBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOrchestrationSpies.onInterruptManual).toHaveBeenCalledTimes(1);
    expect(mockOrchestrationSpies.resetTour).toHaveBeenCalledTimes(1);

    await act(async () => {
      titleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="input-section-mock"]')).toBeTruthy();
    expect(window.localStorage.getItem('ragint_ui_view_mode_v1')).toBe('full');
    view.unmount();
  });

  test('restores last ui page from local storage', () => {
    window.localStorage.setItem('ragint_ui_view_mode_v1', 'simple');
    const view = render(React.createElement(AppShell));

    expect(view.container.querySelector('.simple-tour-main-btn')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="input-section-mock"]')).toBeFalsy();
    view.unmount();
  });

  test('keeps playback mode enabled by auto-selecting first available archive when selected id is invalid', () => {
    const setPlayTourRecordingEnabled = jest.fn();
    const setSelectedTourRecordingId = jest.fn();
    mockAppSettingsOverride = {
      ...mockBuildAppSettings(),
      playTourRecordingEnabled: true,
      selectedTourRecordingId: 'rec-missing',
      setPlayTourRecordingEnabled,
      setSelectedTourRecordingId,
    };
    mockTourRecordingOptionsOverride = {
      options: [
        { recording_id: 'rec-1', label: 'archive-1' },
        { recording_id: 'rec-2', label: 'archive-2' },
      ],
      refresh: jest.fn(),
      ready: true,
    };

    const view = render(React.createElement(AppShell));
    expect(setSelectedTourRecordingId).toHaveBeenCalledWith('rec-1');
    expect(setPlayTourRecordingEnabled).not.toHaveBeenCalled();
    view.unmount();
  });
});


