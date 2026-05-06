import { useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useBackendStatus(requestId, { intervalMs = 800, enabled = true } = {}) {
  const rid = enabled ? String(requestId || '').trim() : '';
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  function requireStatusPayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('status_response_invalid');
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    if (!rid) {
      setError(null);
      return () => {};
    }

    const tick = async () => {
      try {
        const data = requireStatusPayload(await fetchJson(`/api/status?request_id=${encodeURIComponent(rid)}`));
        if (cancelled) return;
        setStatus(data);
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
  }, [rid, intervalMs, enabled]);

  return { status, error };
}
