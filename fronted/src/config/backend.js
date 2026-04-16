// Centralized backend base URL configuration.
//
// In production, default to same-origin so nginx can reverse-proxy `/api/*`.
// In development, default to local backend unless overridden.

export function getBackendBase() {
  const explicit = process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_BACKEND_BASE;
  const raw = String(explicit || '').trim();
  if (raw) return raw.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'development') return 'http://localhost:8101';
  return '';
}

export function backendUrl(path) {
  const base = getBackendBase();
  const p = String(path || '');
  const normalized = p.startsWith('/') ? p : `/${p}`;
  return base ? `${base}${normalized}` : normalized;
}
