import { fetchJson } from './backendClient';

export function sendTourControl({ clientId, action, payload } = {}) {
  const cid = String(clientId || '').trim();
  const act = String(action || '').trim();
  if (!act) return Promise.resolve({ ok: false, error: 'action_required' });
  return fetchJson('/api/tour/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': cid },
    body: JSON.stringify({ action: act, payload: payload && typeof payload === 'object' ? payload : {} }),
  });
}

