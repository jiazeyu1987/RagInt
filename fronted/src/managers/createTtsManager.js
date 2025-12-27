import { TtsQueueManager } from './TtsQueueManager';

export function createOrGetTtsManager({
  ttsManagerRef,
  audioContextRef,
  currentAudioRef,
  runIdRef,
  clientIdRef,
  nowMs,
  baseUrl,
  useSavedTts,
  maxPreGenerateCount,
  ttsMode,
  onStopIndexChange,
  emitClientEvent,
  debugRef,
  debugMark,
  debugRefresh,
  onLog = console.log,
  onWarn = console.warn,
  onError = console.error,
} = {}) {
  if (!ttsManagerRef) throw new Error('createOrGetTtsManager: missing ttsManagerRef');
  if (ttsManagerRef.current) return ttsManagerRef.current;

  const now = typeof nowMs === 'function' ? nowMs : () => Date.now();

  ttsManagerRef.current = new TtsQueueManager({
    audioContextRef,
    currentAudioRef,
    getRunId: () => (runIdRef ? runIdRef.current : 0),
    getClientId: () => (clientIdRef ? clientIdRef.current : ''),
    nowMs: now,
    baseUrl: String(baseUrl || 'http://localhost:8000'),
    useSavedTts: !!useSavedTts,
    maxPreGenerateCount,
    ttsProvider: String(ttsMode || ''),
    onStopIndexChange,
    emitClientEvent: typeof emitClientEvent === 'function' ? emitClientEvent : null,
    onDebug: (evt) => {
      if (!evt || !debugRef || !debugRef.current) return;
      const cur = debugRef.current;
      const seq = typeof evt.seq === 'number' ? evt.seq : null;

      if (evt.type === 'enqueue') {
        cur.segments.push({
          seq,
          chars: Number(evt.chars) || 0,
          ttsRequestAt: null,
          ttsFirstAudioAt: null,
          ttsDoneAt: null,
        });
        if (typeof debugRefresh === 'function') debugRefresh();
        return;
      }

      if (evt.type === 'tts_request') {
        if (!cur.ttsFirstRequestAt) cur.ttsFirstRequestAt = evt.t || now();
        if (seq != null) {
          const segDebug = (cur.segments || []).find((s) => s.seq === seq);
          if (segDebug && segDebug.ttsRequestAt == null) segDebug.ttsRequestAt = evt.t || now();
        }
        if (typeof debugRefresh === 'function') debugRefresh();
        return;
      }

      if (evt.type === 'tts_first_audio') {
        if (typeof debugMark === 'function') debugMark('ttsFirstAudioAt', evt.t || now());
        if (seq != null) {
          const segDebug = (cur.segments || []).find((s) => s.seq === seq);
          if (segDebug && segDebug.ttsFirstAudioAt == null) segDebug.ttsFirstAudioAt = evt.t || now();
        }
        if (typeof debugRefresh === 'function') debugRefresh();
        return;
      }

      if (evt.type === 'tts_done') {
        if (seq != null) {
          const segDebug = (cur.segments || []).find((s) => s.seq === seq);
          if (segDebug && segDebug.ttsDoneAt == null) segDebug.ttsDoneAt = evt.t || now();
        }
        if (typeof debugRefresh === 'function') debugRefresh();
      }
    },
    onLog: (...args) => onLog(...args),
    onWarn: (...args) => onWarn(...args),
    onError: (...args) => onError(...args),
  });

  return ttsManagerRef.current;
}
