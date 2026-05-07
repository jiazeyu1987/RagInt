import { useEffect, useCallback, useRef } from 'react';
import { getBreakpoint, setBreakpoint } from '../api/breakpoint';

function errorFromResponse(res, fallback) {
  const message = String((res && (res.error || res.detail)) || fallback || '').trim();
  return new Error(message || fallback || 'breakpoint_sync_failed');
}

export function useBreakpointSync({ clientId, kind = 'tour', enabled = true, state, onRestore, onError, debounceMs = 800 } = {}) {
  const restoredRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  const onErrorRef = useRef(onError);
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef(null);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reportError = useCallback((phase, error) => {
    if (typeof onErrorRef.current === 'function') {
      onErrorRef.current({ phase, error });
      return;
    }
    throw error;
  }, []);

  useEffect(() => {
    if (!enabled) return () => {};
    if (!clientId) return () => {};
    if (restoredRef.current) return () => {};
    if (restoreInFlightRef.current) return () => {};
    restoreInFlightRef.current = true;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await getBreakpoint({ clientId, kind, signal: ac.signal });
        if (ac.signal.aborted) return;
        if (!res || typeof res !== 'object') throw new Error('breakpoint_restore_invalid_response');
        if (!res.ok) throw errorFromResponse(res, 'breakpoint_restore_failed');
        if (res.state && typeof res.state === 'object') {
          restoredRef.current = true;
          lastSavedRef.current = JSON.stringify(res.state);
          if (typeof onRestoreRef.current === 'function') onRestoreRef.current(res.state, res);
        } else {
          restoredRef.current = true;
        }
      } catch (error) {
        if (ac.signal.aborted) return;
        reportError('restore', error instanceof Error ? error : new Error(String(error || 'breakpoint_restore_failed')));
      } finally {
        restoreInFlightRef.current = false;
      }
    })();
    return () => {
      ac.abort();
      restoreInFlightRef.current = false;
    };
  }, [clientId, enabled, kind, reportError]);

  useEffect(() => {
    if (!enabled) return () => {};
    if (!clientId) return () => {};
    if (!restoredRef.current) return () => {};

    const nextStr = JSON.stringify(state && typeof state === 'object' ? state : {});
    if (nextStr === lastSavedRef.current) return () => {};

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await setBreakpoint({ clientId, kind, state: state && typeof state === 'object' ? state : {} });
        if (!res || typeof res !== 'object') throw new Error('breakpoint_save_invalid_response');
        if (!res.ok) throw errorFromResponse(res, 'breakpoint_save_failed');
        lastSavedRef.current = nextStr;
      } catch (error) {
        reportError('save', error instanceof Error ? error : new Error(String(error || 'breakpoint_save_failed')));
      }
    }, Math.max(200, Number(debounceMs) || 800));

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [clientId, debounceMs, enabled, kind, reportError, state]);
}
