import { useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useBackendEvents(requestId, { intervalMs = 1000, limit = 80, enabled = true } = {}) {
  const rid = enabled ? String(requestId || '').trim() : '';
  const [items, setItems] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [error, setError] = useState(null);

  function requireEventsPayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('events_response_invalid');
    if (!Array.isArray(data.items)) throw new Error('events_items_invalid');
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
        const data = requireEventsPayload(
          await fetchJson(`/api/events?request_id=${encodeURIComponent(rid)}&limit=${encodeURIComponent(String(limit || 80))}`)
        );
        if (cancelled) return;
        setItems(data.items);
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
  }, [rid, intervalMs, limit, enabled]);

  return { items, lastError, error };
}

