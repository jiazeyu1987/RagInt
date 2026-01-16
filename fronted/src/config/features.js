export const VOICE_DEBUG = String(process.env.REACT_APP_VOICE_DEBUG || '0') === '1';

// Wake-word feature flag (disabled by default; enable later when ready).
export const WAKE_WORD_FEATURE_ENABLED = String(process.env.REACT_APP_ENABLE_WAKE_WORD || '0') === '1';

