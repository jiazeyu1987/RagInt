export const CONVERSATION_START_TIMEOUT_MS = 12000;

export function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

export function errorMessage(error) {
  return safeTrim(error && error.message ? error.message : error);
}

export function withTimeout(promise, timeoutMs) {
  const ms = Math.max(1000, Number(timeoutMs) || CONVERSATION_START_TIMEOUT_MS);
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      setTimeout(() => resolve({ started: false, timeout: true }), ms);
    }),
  ]);
}

export function isE2eAsrMockEnabled() {
  if (typeof window === 'undefined') return false;
  return !!(window.__RAGINT_E2E__ && window.__RAGINT_E2E__.enableAsrMock);
}
