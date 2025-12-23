import { useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useBackendStatus(requestId, { intervalMs = 800 } = {}) {
  const rid = String(requestId || '').trim();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    if (!rid) {
      setStatus(null);
      setError(null);
      return () => {};
    }

    const tick = async () => {
      try {
        const data = await fetchJson(`/api/status?request_id=${encodeURIComponent(rid)}`);
        if (cancelled) return;
        setStatus(data || null);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(String((e && e.message) || e || 'status_failed'));
      }
    };

    tick();
    timer = setInterval(tick, Math.max(300, Number(intervalMs) || 800));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [rid, intervalMs]);

  return { status, error };
}

