# Frontend Audio Playback (streaming)

Frontend entry: `fronted/src/App.js`

## High-level flow

1) UI sends `POST /api/ask` and consumes SSE (`chunk` for text, `segment` for TTS units).
2) For each `segment`, frontend calls backend TTS streaming endpoint:
   - `GET /api/text_to_speech_stream?text=...&request_id=...&segment_index=...`
3) Audio playback attempts:
   1. **WebAudio streaming**: `playWavStreamViaWebAudio(...)`
   2. Fallback to `decodeAudioData`
   3. Fallback to `<audio>` element

## WebAudio streaming details

Function: `playWavStreamViaWebAudio(url, audioContextRef, currentAudioRef, ...)`

Key assumptions:
- Backend response is **WAV (RIFF/WAVE)** with PCM16 (`audioFormatCode=1`, `bitsPerSample=16`).
- After parsing WAV header, the remaining bytes are treated as PCM16 interleaved and fed into a `ScriptProcessorNode`.

White-noise guard:
- `enqueuePcmChunk(...)` probes the first ~0.25s audio and computes:
  - RMS and ZCR (zero-crossing rate)
  - If `avgZcr > 0.35 && avgRms > 0.05`, it throws:
    - `PCM sanity check failed (white-noise suspected) ...`

## Repeated WAV headers mid-stream

Some providers may send each websocket frame as a standalone WAV (repeating `RIFF....WAVE`).
If the frontend treats those header bytes as PCM, playback becomes white noise.

Mitigation implemented:
- If a chunk begins with `RIFF` + `WAVE` mid-stream, the parser is reset:
  - logs: `[TTS] Detected embedded WAV header mid-stream; resetting parser`
  - resets `wavInfo/headerBuffer/sanity`

## Interruption

Frontend has an “interrupt previous ask” pattern (see `askAbortRef` and `runIdRef`) to stop older streams when a new question is submitted.

