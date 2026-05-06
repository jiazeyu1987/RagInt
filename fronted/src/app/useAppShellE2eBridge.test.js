import { renderHook } from '../testUtils/renderHook';
import { useAppShellE2eBridge } from './useAppShellE2eBridge';

function props(overrides = {}) {
  return {
    asrE2eProbeRef: {
      current: {
        inputText: 'probe',
        asrPostProcessEvents: [{ type: 'evt', fields: { ok: true } }],
      },
    },
    groupMode: false,
    questionPriority: 'normal',
    useAgentMode: false,
    selectedAgentId: '',
    setGroupMode: jest.fn(),
    setQuestionPriority: jest.fn(),
    setUseAgentMode: jest.fn(),
    setSelectedAgentId: jest.fn(),
    ...overrides,
  };
}

describe('useAppShellE2eBridge', () => {
  beforeEach(() => {
    delete window.__RAGINT_E2E__;
  });

  afterEach(() => {
    delete window.__RAGINT_E2E__;
  });

  test('installs test bridge functions and restores previous bridge on unmount', () => {
    const previous = {
      setGroupMode: jest.fn(),
      getUiState: jest.fn(),
    };
    window.__RAGINT_E2E__ = { ...previous };
    const p = props();

    const hook = renderHook((nextProps) => useAppShellE2eBridge(nextProps), p);

    expect(window.__RAGINT_E2E__.setGroupMode(true)).toBe(true);
    expect(p.setGroupMode).toHaveBeenCalledWith(true);
    expect(window.__RAGINT_E2E__.setQuestionPriority('high')).toBe('high');
    expect(p.setQuestionPriority).toHaveBeenCalledWith('high');
    expect(window.__RAGINT_E2E__.setUseAgentMode(1)).toBe(true);
    expect(p.setUseAgentMode).toHaveBeenCalledWith(true);
    expect(window.__RAGINT_E2E__.setSelectedAgentId(' agent-1 ')).toBe('agent-1');
    expect(p.setSelectedAgentId).toHaveBeenCalledWith('agent-1');
    expect(window.__RAGINT_E2E__.getUiState()).toEqual({
      groupMode: false,
      questionPriority: 'normal',
      useAgentMode: false,
      selectedAgentId: '',
    });
    expect(window.__RAGINT_E2E__.getAsrProbeState().inputText).toBe('probe');

    hook.unmount();

    expect(window.__RAGINT_E2E__.setGroupMode).toBe(previous.setGroupMode);
    expect(window.__RAGINT_E2E__.getUiState).toBe(previous.getUiState);
    expect(window.__RAGINT_E2E__.setQuestionPriority).toBeUndefined();
    expect(window.__RAGINT_E2E__.getAsrProbeState).toBeUndefined();
  });

  test('does nothing when bridge object is missing', () => {
    const hook = renderHook((nextProps) => useAppShellE2eBridge(nextProps), props());
    expect(window.__RAGINT_E2E__).toBeUndefined();
    hook.unmount();
  });
});
