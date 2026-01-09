// Centralized backend base URL configuration.
//
// In development, CRA's `proxy` in `fronted/package.json` forwards `/api/*` and
// `/ws/*` to the backend, so the default here is same-origin (empty base).
//
// To override, set one of:
// - `REACT_APP_BACKEND_URL` (preferred)
// - `REACT_APP_BACKEND_BASE` (legacy)
//
// When unset, default to `http://localhost:8000` (current local backend default).

export function getBackendBase() {
  const raw = String(process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_BACKEND_BASE || 'http://localhost:8000').trim();
  return raw.replace(/\/+$/, '');
}

export function backendUrl(path) {
  const base = getBackendBase();
  const p = String(path || '');
  const normalized = p.startsWith('/') ? p : `/${p}`;
  return base ? `${base}${normalized}` : normalized;
}
