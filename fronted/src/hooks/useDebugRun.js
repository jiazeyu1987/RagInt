import { useCallback, useRef, useState } from 'react';

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function useDebugRun() {
  const [debugInfo, setDebugInfo] = useState(null);
  const debugRef = useRef(null);

  const beginDebugRun = useCallback((trigger) => {
    const t0 = nowMs();
    const next = {
      trigger,
      requestId: null,
      submitAt: t0,
      ragflowFirstChunkAt: null,
      ragflowFirstSegmentAt: null,
      ragflowDoneAt: null,
      ttsFirstRequestAt: null,
      ttsFirstAudioAt: null,
      ttsAllDoneAt: null,
      segments: [],
    };
    debugRef.current = next;
    setDebugInfo(next);
  }, []);

  const debugMark = useCallback((key, t) => {
    const cur = debugRef.current;
    if (!cur) return;
    if (cur[key] != null) return;
    cur[key] = t != null ? t : nowMs();
    setDebugInfo({ ...cur, segments: [...cur.segments] });
  }, []);

  const debugRefresh = useCallback(() => {
    const cur = debugRef.current;
    if (!cur) return;
    setDebugInfo({ ...cur, segments: [...cur.segments] });
  }, []);

  return { debugInfo, debugRef, beginDebugRun, debugMark, debugRefresh };
}
