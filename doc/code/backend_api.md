# Backend API (Flask)

Backend entrypoint: `backend/app.py`

## Endpoints

### `GET /health`

Returns a minimal status snapshot.

Response JSON (example):
```json
{
  "asr_loaded": false,
  "ragflow_connected": true
}
```

### `GET /api/ragflow/chats`

Returns available RAGFlow chats for the frontend dropdown.

Response JSON (shape):
```json
{
  "chats": [{ "id": "...", "name": "..." }],
  "default": "展厅聊天"
}
```

### `POST /api/speech_to_text`

Speech-to-text (non-streaming).

Request:
- multipart/form-data: file field `audio`

Response JSON:
```json
{ "text": "..." }
```

Implementation: `backend/app.py` -> `asr_service.transcribe(...)` in `backend/services/asr_service.py`.

### `POST /api/ask`

RAGFlow question answering with **SSE streaming**.

Request JSON:
```json
{
  "question": "公司有什么产品？",
  "request_id": "ask_...",
  "conversation_name": "展厅聊天"
}
```

Response: `text/event-stream` (SSE). Each event is:
```text
data: {"request_id":"...","t_ms":123,"chunk":"...","done":false}

```

Important SSE payload fields:
- `chunk`: incremental assistant text
- `segment`: text segments intended for TTS (frontend uses these to call TTS endpoint)
- `done`: boolean

Implementation: `backend/app.py`:
- Loads config from `ragflow_demo/ragflow_config.json` (`text_cleaning.*`)
- Uses `ragflow_service.get_session(conversation_name)` to call `rag_session.ask(question, stream=True)`
- Optional segmentation via `TTSTextCleaner` + `TTSBuffer` (modules under `tts_demo/` imported from `backend/app.py`)

### `POST /api/text_to_speech`

Non-streaming TTS (HTTP response body is audio bytes). Used mainly for fallback.

Request JSON:
```json
{
  "text": "你好",
  "request_id": "tts_...",
  "segment_index": 0,
  "tts_provider": "bailian"
}
```

Response:
- Body: audio bytes
- Content-Type: `tts.mimetype` from config (usually `audio/wav`)

Implementation: `backend/app.py` -> `tts_service.stream(...)` in `backend/services/tts_service.py`.

### `GET|POST /api/text_to_speech_stream`

Streaming TTS (HTTP chunked transfer). Frontend expects a **WAV stream**, but some providers may send repeated WAV headers.

Request:
- GET query params: `text`, `request_id`, `segment_index`, optionally `tts_provider`
- or POST JSON with same fields

Response:
- Body: chunked audio bytes
- Content-Type: `tts.mimetype` from config (`audio/wav`)

Implementation: `backend/app.py` -> `tts_service.stream(...)`.

