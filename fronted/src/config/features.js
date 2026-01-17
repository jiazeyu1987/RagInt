export const VOICE_DEBUG = String(process.env.REACT_APP_VOICE_DEBUG || '0') === '1';

// Wake-word feature flag (disabled by default; enable later when ready).
export const WAKE_WORD_FEATURE_ENABLED = String(process.env.REACT_APP_ENABLE_WAKE_WORD || '0') === '1';

// After wake is detected, keep accepting speech for this long (ms) without requiring another wake.
// Used by the frontend for press-to-talk sessions.
export const WAKE_HOLD_MS = (() => {
  const n = Number(process.env.REACT_APP_WAKE_HOLD_MS || '8000');
  if (!Number.isFinite(n)) return 8000;
  return Math.max(500, Math.min(120000, Math.round(n)));
})();
