import { useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useTourTemplates({ enabled } = {}) {
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return () => {};
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchJson('/api/tour/templates');
        if (cancelled) return;
        const items = Array.isArray(res && res.templates) ? res.templates : [];
        setTemplates(items);
        setError('');
      } catch (e) {
        if (cancelled) return;
        setTemplates([]);
        setError(String((e && e.message) || e || 'fetch_failed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { templates, error };
}

