import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useTourRecordingOptions({ enabled, limit = 50 } = {}) {
  const [options, setOptions] = useState([]);

  const formatRecordingLabel = useCallback((createdAtMs) => {
    try {
      const d = new Date(Number(createdAtMs) || Date.now());
      const pad = (n) => String(Number(n) || 0).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}/${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    } catch (_) {
      return String(createdAtMs || '');
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchJson(`/api/recordings?limit=${Number(limit) || 50}`);
    const items = Array.isArray(data && data.items) ? data.items : [];
    setOptions(
      items.map((r) => {
        const rid = String((r && r.recording_id) || '');
        const displayName = r && r.display_name ? String(r.display_name || '').trim() : '';
        return {
          recording_id: rid,
          label: displayName || formatRecordingLabel(r && r.created_at_ms),
        };
      })
    );
  }, [formatRecordingLabel, limit]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    refresh().catch(() => {
      if (cancelled) return;
      setOptions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  return { options, refresh };
}

