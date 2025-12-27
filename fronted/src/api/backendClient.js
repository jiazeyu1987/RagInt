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

export function cancelRequest({ requestId, clientId, reason, kind } = {}) {
  const rid = String(requestId || '').trim();
  const payload = JSON.stringify({
    request_id: rid,
    client_id: String(clientId || '').trim(),
    reason: String(reason || 'client_cancel'),
    kind: String(kind || '').trim() || undefined,
  });

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

export function cancelActive({ clientId, kind, reason } = {}) {
  const payload = JSON.stringify({
    request_id: '',
    client_id: String(clientId || '').trim(),
    reason: String(reason || 'client_cancel'),
    kind: String(kind || 'ask').trim(),
  });
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

export async function emitClientEvent({ requestId, clientId, kind, name, level, fields } = {}) {
  const rid = String(requestId || '').trim();
  if (!rid) return { ok: false, error: 'request_id_required' };
  const payload = {
    request_id: rid,
    client_id: String(clientId || '').trim(),
    kind: String(kind || 'client'),
    name: String(name || '').trim(),
    level: String(level || 'info'),
    fields: fields && typeof fields === 'object' ? fields : {},
  };
  if (!payload.name) return { ok: false, error: 'name_required' };
  return fetchJson('/api/client_events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': payload.client_id },
    body: JSON.stringify(payload),
  });
}

export async function navGoTo({ requestId, clientId, stopId, stopName, timeoutS } = {}) {
  const rid = String(requestId || '').trim();
  const cid = String(clientId || '').trim();
  const sid = String(stopId || '').trim();
  if (!rid || !sid) throw new Error('navGoTo: requestId/stopId required');
  return fetchJson('/api/nav/go_to', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': cid, 'X-Request-ID': rid },
    body: JSON.stringify({
      request_id: rid,
      client_id: cid,
      stop_id: sid,
      stop_name: String(stopName || '').trim(),
      timeout_s: Number.isFinite(Number(timeoutS)) ? Number(timeoutS) : undefined,
    }),
  });
}

export async function navState({ requestId, clientId } = {}) {
  const rid = String(requestId || '').trim();
  const cid = String(clientId || '').trim();
  const qs = new URLSearchParams();
  if (cid) qs.set('client_id', cid);
  if (rid) qs.set('request_id', rid);
  return fetchJson(`/api/nav/state?${qs.toString()}`, {
    method: 'GET',
    headers: { 'X-Client-ID': cid, 'X-Request-ID': rid },
  });
}

export async function navCancel({ requestId, clientId, reason } = {}) {
  const rid = String(requestId || '').trim();
  const cid = String(clientId || '').trim();
  return fetchJson('/api/nav/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': cid, 'X-Request-ID': rid },
    body: JSON.stringify({
      request_id: rid || undefined,
      client_id: cid,
      reason: String(reason || 'client_cancel').trim(),
    }),
  });
}

