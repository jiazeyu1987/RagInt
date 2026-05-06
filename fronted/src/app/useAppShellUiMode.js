import { useCallback, useEffect, useState } from 'react';
import {
  UI_VIEW_MODE_STORAGE_KEY,
  hasTourEntryParam,
  normalizeUiViewMode,
  readInitialUiViewMode,
} from './appShellState';

export function useAppShellUiMode() {
  const [uiViewMode, setUiViewMode] = useState(readInitialUiViewMode);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(UI_VIEW_MODE_STORAGE_KEY, normalizeUiViewMode(uiViewMode));
    } catch (error) {
      throw new Error('Failed to persist UI view mode', { cause: error });
    }
  }, [uiViewMode]);

  const openFullUi = useCallback(() => {
    if (hasTourEntryParam()) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('entry');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      } catch (error) {
        throw new Error('Failed to open full UI', { cause: error });
      }
    }
    setUiViewMode('full');
  }, []);

  const openSimpleUi = useCallback(() => setUiViewMode('simple'), []);

  const openPadHome = useCallback(() => {
    if (typeof window === 'undefined' || !window.location || typeof window.location.assign !== 'function') return;
    window.location.assign('/');
  }, []);

  return {
    uiViewMode,
    openFullUi,
    openSimpleUi,
    openPadHome,
  };
}
