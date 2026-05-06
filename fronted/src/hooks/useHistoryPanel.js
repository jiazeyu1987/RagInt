import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useHistoryPanel({ enabled = false } = {}) {
  const [historySort, setHistorySort] = useState('time'); // 'time' | 'count'
  const [historyItems, setHistoryItems] = useState([]);
  const [historyError, setHistoryError] = useState('');

  const fetchHistory = useCallback(
    async (sortMode) => {
      try {
        const sort = (sortMode || historySort || 'time').trim();
        const data = await fetchJson(`/api/history?sort=${encodeURIComponent(sort)}&limit=200`);
        if (data && data.ok === false) {
          throw new Error(String(data.error || 'history_load_failed'));
        }
        if (!Array.isArray(data && data.items)) {
          throw new Error('history_invalid_response');
        }
        const items = data.items;
        setHistoryItems(items);
        setHistoryError('');
      } catch (e) {
        setHistoryItems([]);
        setHistoryError(String((e && e.message) || e || 'history_load_failed'));
      }
    },
    [historySort]
  );

  useEffect(() => {
    if (!enabled) return;
    fetchHistory(historySort);
  }, [enabled, historySort, fetchHistory]);

  return { historySort, setHistorySort, historyItems, historyError, fetchHistory };
}
