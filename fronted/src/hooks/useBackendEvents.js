import { useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useBackendEvents(requestId, { intervalMs = 1000, limit = 80 } = {}) {
  const rid = String(requestId || '').trim();
  const [items, setItems] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    if (!rid) {
      setItems(null);
      setLastError(null);
      setError(null);
      return () => {};
    }

    const tick = async () => {
      try {
        const data = await fetchJson(`/api/events?request_id=${encodeURIComponent(rid)}&limit=${encodeURIComponent(String(limit || 80))}`);
        if (cancelled) return;
        setItems((data && data.items) || []);
        setLastError((data && data.last_error) || null);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(String((e && e.message) || e || 'events_failed'));
      }
    };

    tick();
    timer = setInterval(tick, Math.max(400, Number(intervalMs) || 1000));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [rid, intervalMs, limit]);

  return { items, lastError, error };
}

