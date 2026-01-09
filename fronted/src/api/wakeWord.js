import { fetchJson } from './backendClient';

export function detectWakeWord({ clientId, text, wakeWords, cooldownMs, matchMode } = {}) {
  const payload = {
    text: String(text || ''),
    wake_words: Array.isArray(wakeWords) ? wakeWords : undefined,
    cooldown_ms: Number.isFinite(Number(cooldownMs)) ? Number(cooldownMs) : undefined,
    match_mode: String(matchMode || '').trim() || undefined,
  };
  return fetchJson('/api/wake_word/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-ID': String(clientId || '').trim() },
    body: JSON.stringify(payload),
  });
}
