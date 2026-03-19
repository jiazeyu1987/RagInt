export const VOICE_DEBUG = String(process.env.REACT_APP_VOICE_DEBUG || '0') === '1';
export const ASK_TRACE_DEBUG =
  String(process.env.REACT_APP_ASK_TRACE_DEBUG || '0') === '1' || VOICE_DEBUG;

// After wake is detected, keep accepting speech for this long (ms) without requiring another wake.
// Used by the frontend for press-to-talk sessions.
export const WAKE_HOLD_MS = (() => {
  const n = Number(process.env.REACT_APP_WAKE_HOLD_MS || '8000');
  if (!Number.isFinite(n)) return 8000;
  return Math.max(500, Math.min(120000, Math.round(n)));
})();
