# Codebase Notes (for LLM analysis)

These docs summarize the current voice-QA pipeline so an LLM can quickly reason about streaming, ordering, format assumptions, and where white-noise issues can originate.

## Document index

- `doc/code/backend_api.md` — HTTP API endpoints, payloads, and streaming formats (SSE + audio streaming).
- `doc/code/backend_services.md` — Backend modules/classes split (ASR / RAG / TTS) and key behaviors.
- `doc/code/frontend_audio.md` — Frontend streaming audio playback pipeline (WebAudio + fallbacks) and WAV/PCM assumptions.
- `doc/code/configuration.md` — `ragflow_demo/ragflow_config.json` configuration reference used by both backend and frontend behaviors.
- `doc/code/debugging_white_noise.md` — Practical checklist to diagnose “white noise” issues end-to-end.

