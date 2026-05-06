import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPanel } from './SettingsPanel';

jest.mock('./SettingsDrawer', () => ({
  SettingsDrawer: ({ open, children }) => {
    if (!open) return null;
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'settings-drawer-mock' }, children);
  },
}));

jest.mock('./SettingsToggles', () => ({
  SettingsToggles: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'settings-toggles-mock' });
  },
}));

jest.mock('./StagePanel', () => ({
  StagePanel: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'stage-panel-mock' });
  },
}));

jest.mock('./TourModePanel', () => ({
  TourModePanel: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'tour-mode-panel-mock' });
  },
}));

jest.mock('./QaAudioCachePanel', () => ({
  QaAudioCachePanel: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'qa-audio-cache-panel-mock' });
  },
}));

jest.mock('./RecordingArchivePreviewPanel', () => ({
  RecordingArchivePreviewPanel: () => {
    const ReactRef = require('react');
    return ReactRef.createElement('div', { 'data-testid': 'archive-preview-panel-mock' });
  },
}));

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

function buildProps(overrides = {}) {
  return {
    open: true,
    onClose: jest.fn(),
    docked: true,
    showHistoryPanel: false,
    onChangeShowHistoryPanel: jest.fn(),
    showDebugPanel: false,
    onChangeShowDebugPanel: jest.fn(),
    controlBarProps: {},
    stagePanelProps: {},
    tourModePanelProps: {},
    ttsMode: 'modelscope',
    modelscopeVoice: '',
    onChangeModelscopeVoice: jest.fn(),
    ttsFetchConcurrency: 4,
    onChangeTtsFetchConcurrency: jest.fn(),
    groupMode: false,
    speakerName: 'speaker',
    onChangeSpeakerName: jest.fn(),
    questionPriority: 'normal',
    onChangeQuestionPriority: jest.fn(),
    onQuickSummary: jest.fn(),
    onPrevStop: jest.fn(),
    onNextStop: jest.fn(),
    onClearExhibitChatSessions: jest.fn(),
    activeTab: 'ops',
    onChangeActiveTab: jest.fn(),
    ragflowStatusLabel: '\u68c0\u6d4b\u4e2d',
    ragflowStatusDetail: '',
    ...overrides,
  };
}

describe('SettingsPanel', () => {
  test('renders docked mode and switches tab via callback', () => {
    const props = buildProps();
    const view = render(<SettingsPanel {...props} />);
    expect(view.container.querySelector('.settings-docked')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="stage-panel-mock"]')).toBeTruthy();

    const tabs = view.container.querySelectorAll('.settings-tab-btn');
    act(() => {
      tabs[8].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(props.onChangeActiveTab).toHaveBeenCalledWith('template');
    view.unmount();
  });

  test('renders drawer mode when not docked', () => {
    const props = buildProps({ docked: false, activeTab: 'template' });
    const view = render(<SettingsPanel {...props} />);
    expect(view.container.querySelector('[data-testid="settings-drawer-mock"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="tour-mode-panel-mock"]')).toBeTruthy();
    view.unmount();
  });

  test('shows ragflow connection status in debug tab', () => {
    const props = buildProps({
      activeTab: 'debug',
      ragflowStatusLabel: '\u672a\u8fde\u63a5',
      ragflowStatusDetail: 'HTTP 500 /api/ragflow/chats',
    });
    const view = render(<SettingsPanel {...props} />);
    expect(view.container.textContent).toContain('RAGFlow \u8fde\u63a5');
    expect(view.container.textContent).toContain('\u672a\u8fde\u63a5');
    expect(view.container.textContent).toContain('HTTP 500 /api/ragflow/chats');
    view.unmount();
  });

  test('filters legacy fallback stops in stop prompt tab and saves sanitized map', () => {
    const onSaveTourStopPromptOverrides = jest.fn();
    const props = buildProps({
      activeTab: 'stop_prompt',
      controlBarProps: {
        tourStopsOverride: [],
        tourStops: ['company_overview', 'biz_stop'],
        tourStopPromptOverrides: {
          company_overview: 'legacy',
          biz_stop: 'focus on key facts',
        },
        onSaveTourStopPromptOverrides,
      },
    });
    const view = render(<SettingsPanel {...props} />);

    expect(view.container.textContent).toContain('biz_stop');
    expect(view.container.textContent).not.toContain('company_overview');

    const saveButton = view.container.querySelector('.settings-action-btn-primary');
    expect(saveButton).toBeTruthy();
    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSaveTourStopPromptOverrides).toHaveBeenCalledWith({
      biz_stop: 'focus on key facts',
    });
    view.unmount();
  });

  test('rejects invalid stop prompt override shape instead of rendering empty prompts', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <SettingsPanel
          {...buildProps({
            activeTab: 'stop_prompt',
            controlBarProps: {
              tourStops: ['biz_stop'],
              tourStopPromptOverrides: [],
            },
          })}
        />
      )
    ).toThrow('settings_stop_prompt_overrides_invalid');
    consoleErrorSpy.mockRestore();
  });

  test('rejects invalid explicit tour stop list shape instead of treating it as empty', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <SettingsPanel
          {...buildProps({
            activeTab: 'stop_prompt',
            controlBarProps: {
              tourStops: 'biz_stop',
              tourStopPromptOverrides: {},
            },
          })}
        />
      )
    ).toThrow('settings_tour_stops_invalid');
    consoleErrorSpy.mockRestore();
  });

  test('shows only silence timing control for conversation auto submit in asr tab', () => {
    const props = buildProps({
      activeTab: 'asr',
      controlBarProps: {
        asrConversationAutoSubmitSilenceMs: 1200,
        onChangeAsrConversationAutoSubmitSilenceMs: jest.fn(),
        asrConversationContextStrategy: 'smart_recent_current',
        onChangeAsrConversationContextStrategy: jest.fn(),
        asrConversationContextRecentTurns: 10,
        onChangeAsrConversationContextRecentTurns: jest.fn(),
        asrConversationContextMaxTokens: 16000,
        onChangeAsrConversationContextMaxTokens: jest.fn(),
        asrAutoResumeAfterAnswerEnabled: true,
        onChangeAsrAutoResumeAfterAnswerEnabled: jest.fn(),
        asrAutoResumeAfterAnswerDelayMs: 2200,
        onChangeAsrAutoResumeAfterAnswerDelayMs: jest.fn(),
        asrRecognitionStage: 'idle',
        asrPostProcessStage: 'idle',
        asrPostProcessEvents: [],
      },
    });
    const view = render(<SettingsPanel {...props} />);

    expect(view.container.textContent).toContain('静音判定时长（毫秒）');
    expect(view.container.textContent).not.toContain('语音结束后自动发送问题');
    expect(view.container.textContent).not.toContain('自动发送范围');
    view.unmount();
  });
});

