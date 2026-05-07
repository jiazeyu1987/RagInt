export const MAX_CONTEXT_TURNS = 200;

export function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

export function nowWallMs() {
  return Date.now();
}

export function sanitizeTurns(turns) {
  const src = Array.isArray(turns) ? turns : [];
  const out = [];
  for (const item of src) {
    if (!item || typeof item !== 'object') continue;
    const q = safeTrim(item.question);
    const a = safeTrim(item.answer);
    if (!q || !a) continue;
    out.push({
      question: q,
      answer: a,
      ts: Number(item.ts) || Date.now(),
    });
  }
  return out.slice(-MAX_CONTEXT_TURNS);
}

export function requireRecordingStopPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('recording_stop_invalid_response');
  }
  if (!Array.isArray(payload.chunks)) throw new Error('recording_stop_invalid_chunks');
  if (!Array.isArray(payload.segments)) throw new Error('recording_stop_invalid_segments');
  return payload;
}
