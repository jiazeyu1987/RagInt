// Backend API client helpers (fetch wrappers).

const BASE = 'http://localhost:8000';

export const backendUrl = (path) => `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

export async function fetchJson(path, { method = 'GET', headers = {}, body, signal } = {}) {
  const resp = await fetch(backendUrl(path), {
    method,
    headers: { ...(headers || {}) },
    body,
    signal,
  });
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  if (!resp.ok) {
    const msg = `HTTP ${resp.status} ${path}`;
    throw new Error(msg);
  }
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return { ok: true, text };
  }
}

export function cancelRequest({ requestId, clientId, reason }) {
  const rid = String(requestId || '').trim();
  if (!rid) return;
  const payload = JSON.stringify({ request_id: rid, client_id: String(clientId || '').trim(), reason: String(reason || 'client_cancel') });

  try {
    if (navigator && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(backendUrl('/api/cancel'), new Blob([payload], { type: 'application/json' }));
      if (ok) return;
    }
  } catch (_) {
    // ignore
  }
  try {
    fetch(backendUrl('/api/cancel'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-ID': String(clientId || '').trim() },
      body: payload,
    }).catch(() => {});
  } catch (_) {
    // ignore
  }
}

