import { useCallback, useEffect, useRef, useState } from 'react';

export function useTransientQueueStatus(initialStatus = '') {
  const [queueStatus, setQueueStatus] = useState(initialStatus);
  const transientStatusTimerRef = useRef(null);

  const showTransientQueueStatus = useCallback((message, durationMs = 2000) => {
    const text = String(message || '').trim();
    if (!text) return;
    const timeoutMs = Number(durationMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error('transient_queue_status_duration_invalid');
    setQueueStatus(text);
    try {
      if (transientStatusTimerRef.current) window.clearTimeout(transientStatusTimerRef.current);
    } catch (_) {
      // ignore
    }
    transientStatusTimerRef.current = window.setTimeout(() => {
      transientStatusTimerRef.current = null;
      setQueueStatus('');
    }, timeoutMs);
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (transientStatusTimerRef.current) window.clearTimeout(transientStatusTimerRef.current);
      } catch (_) {
        // ignore
      }
      transientStatusTimerRef.current = null;
    };
  }, []);

  return {
    queueStatus,
    setQueueStatus,
    showTransientQueueStatus,
  };
}
