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
        if (res && res.ok === false) {
          throw new Error(String(res.error || 'tour_templates_load_failed'));
        }
        if (!Array.isArray(res && res.templates)) {
          throw new Error('tour_templates_invalid_response');
        }
        const items = res.templates;
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
