import { fetchJson } from './backendClient';

export function parseTourCommand({ clientId, text, stops } = {}) {
  const payload = {
    text: String(text || ''),
    stops: Array.isArray(stops) ? stops : [],
  };
  return fetchJson('/api/tour/command/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': String(clientId || '').trim() },
    body: JSON.stringify(payload),
  });
}

