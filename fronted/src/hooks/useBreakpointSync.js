import { useEffect, useRef } from 'react';
import { getBreakpoint, setBreakpoint } from '../api/breakpoint';

export function useBreakpointSync({ clientId, kind = 'tour', enabled = true, state, onRestore, debounceMs = 800 } = {}) {
  const restoredRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef(null);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

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
        if (!res || typeof res !== 'object') return;
        if (!res.ok) return;
        if (res.state && typeof res.state === 'object') {
          restoredRef.current = true;
          lastSavedRef.current = JSON.stringify(res.state);
          if (typeof onRestoreRef.current === 'function') onRestoreRef.current(res.state, res);
        } else {
          restoredRef.current = true;
        }
      } catch (_) {
        if (ac.signal.aborted) return;
        restoredRef.current = true;
      } finally {
        restoreInFlightRef.current = false;
      }
    })();
    return () => {
      ac.abort();
      restoreInFlightRef.current = false;
    };
  }, [clientId, enabled, kind]);

  useEffect(() => {
    if (!enabled) return () => {};
    if (!clientId) return () => {};
    if (!restoredRef.current) return () => {};

    const nextStr = JSON.stringify(state && typeof state === 'object' ? state : {});
    if (nextStr === lastSavedRef.current) return () => {};

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await setBreakpoint({ clientId, kind, state: state && typeof state === 'object' ? state : {} });
        lastSavedRef.current = nextStr;
      } catch (_) {
        // ignore
      }
    }, Math.max(200, Number(debounceMs) || 800));

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [clientId, debounceMs, enabled, kind, state]);
}
