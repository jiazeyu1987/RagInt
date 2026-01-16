import { VOICE_DEBUG } from './features';

function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

export function buildAsrHttpEndpoint(baseUrl) {
  const base = safeTrim(baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
  return `${base}/api/speech_to_text`;
}

export function buildAsrWsUrl(baseUrl, { role } = {}) {
  const base = safeTrim(baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
  const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  const qs = VOICE_DEBUG && role ? `?role=${encodeURIComponent(String(role))}` : '';
  return `${wsBase}/ws/asr${qs}`;
}

