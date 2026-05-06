import { renderHook } from '../testUtils/renderHook';
import { useEscapeInterrupt } from './useEscapeInterrupt';

describe('useEscapeInterrupt', () => {
  let hooks;

  beforeEach(() => {
    hooks = [];
  });

  afterEach(() => {
    hooks.forEach((hook) => hook.unmount());
  });

  function renderEscapeInterrupt(overrides = {}) {
    const interruptEscape = jest.fn();
    const getRunCoordinator = jest.fn(() => ({ interruptEscape }));
    const props = {
      isLoading: false,
      askAbortRef: { current: null },
      ttsManagerRef: { current: null },
      currentAudioRef: { current: null },
      getRunCoordinator,
      ...overrides,
    };
    const hook = renderHook((nextProps) => useEscapeInterrupt(nextProps), props);
    hooks.push(hook);
    return { hook, interruptEscape, getRunCoordinator };
  }

  test('interrupts active runs on Escape and prevents the default key action', () => {
    const { interruptEscape } = renderEscapeInterrupt({ isLoading: true });
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });

    window.dispatchEvent(event);

    expect(interruptEscape).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  test('ignores non-Escape keys and inactive runs', () => {
    const inactive = renderEscapeInterrupt();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(inactive.interruptEscape).not.toHaveBeenCalled();
    inactive.hook.unmount();

    const active = renderEscapeInterrupt({ currentAudioRef: { current: {} } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(active.interruptEscape).not.toHaveBeenCalled();
  });

  test('removes its key listener on unmount', () => {
    const { hook, interruptEscape } = renderEscapeInterrupt({ askAbortRef: { current: {} } });
    hook.unmount();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

    expect(interruptEscape).not.toHaveBeenCalled();
  });
});
