import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { UI_VIEW_MODE_STORAGE_KEY } from './appShellState';
import { useAppShellUiMode } from './useAppShellUiMode';

describe('useAppShellUiMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/ragint/?entry=tour');
  });

  test('starts in simple mode for tour entry and removes entry when opening full UI', () => {
    const hook = renderHook(() => useAppShellUiMode());

    expect(hook.result().uiViewMode).toBe('simple');

    act(() => hook.result().openFullUi());

    expect(hook.result().uiViewMode).toBe('full');
    expect(window.location.search).toBe('');
    expect(window.localStorage.getItem(UI_VIEW_MODE_STORAGE_KEY)).toBe('full');

    hook.unmount();
  });

  test('opens simple UI and pad home directly', () => {
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });
    const hook = renderHook(() => useAppShellUiMode());

    act(() => hook.result().openSimpleUi());
    expect(hook.result().uiViewMode).toBe('simple');
    expect(window.localStorage.getItem(UI_VIEW_MODE_STORAGE_KEY)).toBe('simple');

    act(() => hook.result().openPadHome());
    expect(assign).toHaveBeenCalledWith('/');

    hook.unmount();
  });

  test('throws when UI mode persistence fails', () => {
    const hook = renderHook(() => useAppShellUiMode());
    const storageError = new Error('storage denied');
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw storageError;
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() => {
        act(() => hook.result().openFullUi());
      }).toThrow('Failed to persist UI view mode');
    } finally {
      consoleError.mockRestore();
    }

    hook.unmount();
  });

  test('throws when opening full UI cannot clean the tour entry parameter', () => {
    const OriginalURL = global.URL;
    global.URL = jest.fn(() => {
      throw new Error('bad url');
    });

    try {
      const hook = renderHook(() => useAppShellUiMode());

      expect(() => {
        act(() => hook.result().openFullUi());
      }).toThrow('Failed to open full UI');

      expect(hook.result().uiViewMode).toBe('simple');
      hook.unmount();
    } finally {
      global.URL = OriginalURL;
    }
  });
});
