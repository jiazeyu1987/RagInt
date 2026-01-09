import { useEffect, useRef } from 'react';
import { getBreakpoint, setBreakpoint } from '../api/breakpoint';

export function useBreakpointSync({ clientId, kind = 'tour', enabled = true, state, onRestore, debounceMs = 800 } = {}) {
  const restoredRef = useRef(false);
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return () => {};
    if (!clientId) return () => {};
    if (restoredRef.current) return () => {};
    let cancelled = false;
    (async () => {
      try {
        const res = await getBreakpoint({ clientId, kind });
        if (cancelled) return;
        if (!res || typeof res !== 'object') return;
        if (!res.ok) return;
        if (res.state && typeof res.state === 'object') {
          restoredRef.current = true;
          lastSavedRef.current = JSON.stringify(res.state);
          if (typeof onRestore === 'function') onRestore(res.state, res);
        } else {
          restoredRef.current = true;
        }
      } catch (_) {
        restoredRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, enabled, kind, onRestore]);

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

