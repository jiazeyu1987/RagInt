import { fetchJson } from './backendClient';

export function parseTourCommand({ clientId, text, stops } = {}) {
  const commandText = String(text || '').trim();
  if (!commandText) return Promise.resolve({ ok: false, error: 'text_required' });
  if (!Array.isArray(stops)) return Promise.resolve({ ok: false, error: 'stops_list_required' });
  const payload = {
    text: commandText,
    stops,
  };
  return fetchJson('/api/tour/command/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': String(clientId || '').trim() },
    body: JSON.stringify(payload),
  });
}
