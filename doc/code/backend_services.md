# Backend Services (ASR / RAG / TTS)

Backend services live in `backend/services/` and are instantiated in `backend/app.py`.

## ASR — `backend/services/asr_service.py`

Class: `ASRService`

Key behaviors:
- Supports 3 ASR providers via `asr.provider`: `funasr` (default), `faster_whisper`, `dashscope`.
- Tries to load FunASR; if missing, logs error and falls back to other providers (depending on config).
- Normalizes incoming audio via `ffmpeg` to WAV 16kHz mono PCM16; optional silence trim via config:
  - `asr.preprocess.trim_silence`
- Entry used by route: `POST /api/speech_to_text` -> `ASRService.transcribe(raw_bytes, app_config)`

## RAG — `backend/services/ragflow_service.py`

Class: `RagflowService`

Key behaviors:
- Loads config from `ragflow_demo/ragflow_config.json`
- Creates `ragflow_sdk.RAGFlow` client and resolves dataset/chat
- Caches sessions per chat name (thread-safe)

Used by:
- `GET /api/ragflow/chats` -> `ragflow_service.list_chats()`
- `POST /api/ask` -> `ragflow_service.get_session(conversation_name)`

## TTS — `backend/services/tts_service.py`

Class: `TTSSvc`

Provider selection:
- `tts.provider` in config (commonly `bailian`)
- `tts.bailian.mode`: `dashscope` (SDK streaming) or `http`
- Local GPT-SoVITS HTTP mode supported but typically disabled via `tts.local.enabled=false`

DashScope streaming (`bailian.mode=dashscope`) highlights:
- Uses DashScope CosyVoice via `dashscope.audio.tts_v2` (websocket under the hood).
- Maintains a global `SpeechSynthesizerObjectPool` (connection pool).
- Per-request ordering state: `tts_state_update(...)` logs out-of-order / duplicate segment indices.
- WAV/PCM probes:
  - Checks first chunk `RIFF` prefix (WAV).
  - Parses WAV header (best-effort) and runs a PCM “white-noise suspect” probe (RMS + ZCR).

Hardening added for white-noise regressions:
- Avoids dropping audio bytes on backpressure (dropping corrupts WAV -> white noise).
- If a request looks suspicious (bad WAV header / white-noise probe / experienced backpressure), it **does not return the synthesizer to the pool**; it closes it instead to avoid contaminating subsequent requests.

Related logs to search:
- `dashscope_tts_first_chunk`
- `wav_probe_*`
- `pcm_probe_suspect_white_noise`
- `dashscope_tts_backpressure_wait`
- `dashscope_tts_pool_skip_return`
