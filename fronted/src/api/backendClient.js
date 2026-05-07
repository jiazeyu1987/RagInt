// Backend API client helpers (fetch wrappers).

import { backendUrl as configBackendUrl } from '../config/backend';

export const backendUrl = configBackendUrl;

export async function fetchJson(path, { method = 'GET', headers = {}, body, signal } = {}) {
  const resp = await fetch(backendUrl(path), {
    method,
    headers: { ...(headers || {}) },
    body,
    signal,
  });
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  if (!resp.ok) {
    if (ct.includes('application/json')) {
      let payload = null;
      try {
        payload = await resp.json();
      } catch {
        throw new Error(`Invalid JSON error response ${path}`);
      }
      const detail = String((payload && (payload.error || payload.detail)) || '').trim();
      if (detail) throw new Error(detail);
    }
    throw new Error(`HTTP ${resp.status} ${path}`);
  }
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON response ${path}`);
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

export async function filterAsrText({ text, prompt, chatName, domainTerms } = {}) {
  return fetchJson('/api/asr/filter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: String(text || ''),
      prompt: String(prompt || ''),
      chat_name: String(chatName || ''),
      domain_terms: String(domainTerms || ''),
    }),
  });
}

export async function fetchAppSettings({ clientId } = {}) {
  return fetchJson('/api/app_settings', {
    method: 'GET',
    headers: { 'X-Client-ID': String(clientId || '').trim() },
  });
}

export async function saveAppSettings({ clientId, settings } = {}) {
  return fetchJson('/api/app_settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-ID': String(clientId || '').trim(),
    },
    body: JSON.stringify({
      client_id: String(clientId || '').trim(),
      settings: settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {},
    }),
  });
}

export async function fetchRagflowConfig() {
  return fetchJson('/api/ragflow/config', { method: 'GET' });
}

export async function saveRagflowConfig({ apiKey } = {}) {
  return fetchJson('/api/ragflow/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: String(apiKey || '').trim() }),
  });
}

