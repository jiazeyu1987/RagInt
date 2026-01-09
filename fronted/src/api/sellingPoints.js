import { fetchJson } from './backendClient';

export function listSellingPoints({ stopName, limit = 50 } = {}) {
  const sn = String(stopName || '').trim();
  if (!sn) return Promise.resolve({ ok: true, stop_name: '', items: [] });
  return fetchJson(`/api/selling_points?stop_name=${encodeURIComponent(sn)}&limit=${encodeURIComponent(String(limit))}`);
}

export function upsertSellingPoint({ stopName, text, weight = 0, tags = [] } = {}) {
  return fetchJson('/api/selling_points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stop_name: String(stopName || '').trim(),
      text: String(text || '').trim(),
      weight: Number(weight) || 0,
      tags: Array.isArray(tags) ? tags : [],
    }),
  });
}

export function deleteSellingPoint({ stopName, text } = {}) {
  const sn = String(stopName || '').trim();
  const t = String(text || '').trim();
  return fetchJson(`/api/selling_points?stop_name=${encodeURIComponent(sn)}&text=${encodeURIComponent(t)}`, { method: 'DELETE' });
}

