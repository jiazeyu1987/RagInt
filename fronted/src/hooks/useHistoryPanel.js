import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useHistoryPanel({ enabled = false } = {}) {
  const [historySort, setHistorySort] = useState('time'); // 'time' | 'count'
  const [historyItems, setHistoryItems] = useState([]);

  const fetchHistory = useCallback(
    async (sortMode) => {
      try {
        const sort = (sortMode || historySort || 'time').trim();
        const data = await fetchJson(`/api/history?sort=${encodeURIComponent(sort)}&limit=200`);
        const items = Array.isArray(data && data.items) ? data.items : [];
        setHistoryItems(items);
      } catch (_) {
        setHistoryItems([]);
      }
    },
    [historySort]
  );

  useEffect(() => {
    if (!enabled) return;
    fetchHistory(historySort);
  }, [enabled, historySort, fetchHistory]);

  return { historySort, setHistorySort, historyItems, fetchHistory };
}
