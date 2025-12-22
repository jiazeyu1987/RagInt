# Debugging “White Noise” (end-to-end)

This project can produce “white noise” during TTS playback due to **byte-stream corruption** or **format mismatches** between backend output and frontend decoding assumptions.

## What “white noise” usually means here

1) Frontend decoded non-audio bytes as PCM (e.g., WAV header bytes treated as PCM).
2) Audio bytes were dropped/truncated in the backend stream (WAV corruption).
3) Connection pool reused a “bad” websocket/synthesizer and contaminated later requests.

## Fast checklist

### 1) Capture the request id and segment

From frontend console:
- Look for `[TTS] ...` logs and the `request_id` used when calling `/api/text_to_speech_stream`.

### 2) Backend logs to grep

Search backend console/log for the same `request_id`:
- `dashscope_tts_first_chunk ... riff=...`
- `wav_probe ...` / `wav_probe_failed`
- `pcm_probe_suspect_white_noise ...`
- `dashscope_tts_backpressure_wait ...`
- `dashscope_tts_pool_skip_return ...`

If you see `riff=False`, `wav_probe_failed`, or `pcm_probe_suspect_white_noise`, the provider stream is likely malformed or not “single WAV header + PCM body”.

### 3) Frontend logs to grep

In `fronted/src/App.js`:
- `PCM sanity check failed (white-noise suspected): ...`
- `[TTS] Detected embedded WAV header mid-stream; resetting parser`

If you see the “embedded WAV header” log, the provider is likely sending repeated RIFF headers.

## Current mitigations implemented

Backend (`backend/services/tts_service.py`):
- Avoids dropping audio bytes when queue is full.
- If a stream looks suspicious or experienced backpressure, it closes the synthesizer instead of returning it to the pool.

Frontend (`fronted/src/App.js`):
- Detects RIFF/WAVE header appearing mid-stream and resets parsing state to avoid treating it as PCM.

## Next steps if noise still happens

1) Prefer outputting **PCM-only** from backend (no WAV container) and switch frontend to PCM streaming.
2) Disable connection pool temporarily (`tts.bailian.use_connection_pool=false`) to confirm whether contamination is pool-related.
3) Dump and compare raw bytes for a failing stream vs a good stream (both backend-side and frontend received bytes).

