# Backend (RagInt)

## Run (development)

From repo root:

- `python -m backend`

Key endpoints:

- `GET /health`
- `GET /api/openapi.json`
- `POST /api/ask` (SSE)
- `POST /api/speech_to_text`
- `POST /api/text_to_speech`
- `GET|POST|DELETE /api/breakpoint` (client breakpoint persistence)
- `POST /api/wake_word/detect` (wake-word detection helper)
- `GET|POST /api/tour/control` (on-site control panel command bus)
- `GET /api/tour/templates` (basic tour templates)
- `POST /api/tour/plan` (tour plan; supports `stops_override`)
- `POST /api/tour/command/parse` (voice tour commands: next/prev/jump/etc)
- `GET|POST|DELETE /api/selling_points` + `GET /api/selling_points/topn` (selling points TopN)
- `GET /ops` + `/api/ops/*` (ops console + device/config MVP)

## Environment variables

See `backend/.env.example`.

### TTS speed

- Client can send optional `tts_speed` (multiplier) to `/api/text_to_speech` (and stream/saved variants) to speed up speech.
- Best-effort provider support: `modelscope`(bailian/dashscope), `edge`, `sapi` support per-request speed; others degrade to default.

### KB version + Q&A cache

- Set `RAGINT_KB_VERSION` to tag the current knowledge-base version (used to scope Q&A cache entries).
- Configure `qa_cache` in your `RAGINT_CONFIG_PATH` JSON (optional):
  - `qa_cache.enabled` (default: true)
  - `qa_cache.ttl_s` (default: 3600)

### Sensitive words blacklist

- Set `RAGINT_SENSITIVE_WORDS` (comma/semicolon/newline separated) to block `/api/ask` input/output when a term is matched.

## Smoke tests (recommended)

With a working Python install:

- Import + app factory: `python -c "from backend.app import create_app; app=create_app(); print('create_app_ok', bool(app))"`
- Unit tests: `pip install -r backend/requirements.txt -r backend/requirements-dev.txt && pytest -q`

### Multi-process / multi-instance

If you deploy behind gunicorn/uwsgi (multiple workers) or run multiple replicas, enable Redis state:

- `RAGINT_STATE_BACKEND=redis`
- `RAGINT_REDIS_URL=redis://...`

This makes cancellation / rate limiting / event timeline consistent across processes.

## Production (WSGI)

- WSGI entrypoint: `backend/wsgi.py` (`app = create_app()`).
