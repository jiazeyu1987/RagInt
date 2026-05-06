import { fetchJson } from './backendClient';

export function sendTourControl({ clientId, action, payload } = {}) {
  const cid = String(clientId || '').trim();
  const act = String(action || '').trim();
  if (!act) return Promise.resolve({ ok: false, error: 'action_required' });
  if (payload != null && (typeof payload !== 'object' || Array.isArray(payload))) {
    return Promise.resolve({ ok: false, error: 'payload_object_required' });
  }
  return fetchJson('/api/tour/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': cid },
    body: JSON.stringify({ action: act, payload: payload || {} }),
  });
}
