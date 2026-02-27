import { fetchJson } from './backendClient';

export function getBreakpoint({ clientId, kind = 'tour', signal } = {}) {
  return fetchJson(`/api/breakpoint?kind=${encodeURIComponent(String(kind || 'tour'))}`, {
    method: 'GET',
    headers: { 'X-Client-ID': String(clientId || '').trim() },
    signal,
  });
}

export function setBreakpoint({ clientId, kind = 'tour', state, signal } = {}) {
  return fetchJson('/api/breakpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': String(clientId || '').trim() },
    body: JSON.stringify({ kind: String(kind || 'tour'), state: state && typeof state === 'object' ? state : {} }),
    signal,
  });
}

export function clearBreakpoint({ clientId, kind = 'tour', signal } = {}) {
  return fetchJson(`/api/breakpoint?kind=${encodeURIComponent(String(kind || 'tour'))}`, {
    method: 'DELETE',
    headers: { 'X-Client-ID': String(clientId || '').trim() },
    signal,
  });
}
