export function requirePositiveNumber(value, message) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(message);
  return n;
}

export function normalizeBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).toString().replace(/\/+$/, '');
  } catch (e) {
    throw new Error(`invalid_base_url: ${raw}`);
  }
}
