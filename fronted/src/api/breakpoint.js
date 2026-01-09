import { fetchJson } from './backendClient';

export function getBreakpoint({ clientId, kind = 'tour' } = {}) {
  return fetchJson(`/api/breakpoint?kind=${encodeURIComponent(String(kind || 'tour'))}`, {
    method: 'GET',
    headers: { 'X-Client-ID': String(clientId || '').trim() },
  });
}

export function setBreakpoint({ clientId, kind = 'tour', state } = {}) {
  return fetchJson('/api/breakpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': String(clientId || '').trim() },
    body: JSON.stringify({ kind: String(kind || 'tour'), state: state && typeof state === 'object' ? state : {} }),
  });
}

export function clearBreakpoint({ clientId, kind = 'tour' } = {}) {
  return fetchJson(`/api/breakpoint?kind=${encodeURIComponent(String(kind || 'tour'))}`, {
    method: 'DELETE',
    headers: { 'X-Client-ID': String(clientId || '').trim() },
  });
}

