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
});

