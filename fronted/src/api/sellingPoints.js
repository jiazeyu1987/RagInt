import { fetchJson } from './backendClient';

export function listSellingPoints({ stopName, limit = 50 } = {}) {
  const sn = String(stopName || '').trim();
  if (!sn) return Promise.resolve({ ok: false, error: 'stop_name_required' });
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) return Promise.resolve({ ok: false, error: 'limit_invalid' });
  return fetchJson(`/api/selling_points?stop_name=${encodeURIComponent(sn)}&limit=${encodeURIComponent(String(n))}`);
}

export function upsertSellingPoint({ stopName, text, weight = 0, tags = [] } = {}) {
  const w = Number(weight);
  if (!Number.isFinite(w)) return Promise.resolve({ ok: false, error: 'weight_invalid' });
  if (!Array.isArray(tags)) return Promise.resolve({ ok: false, error: 'tags_list_required' });
  return fetchJson('/api/selling_points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stop_name: String(stopName || '').trim(),
      text: String(text || '').trim(),
      weight: w,
      tags,
    }),
  });
}

export function deleteSellingPoint({ stopName, text } = {}) {
  const sn = String(stopName || '').trim();
  const t = String(text || '').trim();
  return fetchJson(`/api/selling_points?stop_name=${encodeURIComponent(sn)}&text=${encodeURIComponent(t)}`, { method: 'DELETE' });
}
