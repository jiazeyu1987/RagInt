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

## Environment variables

See `backend/.env.example`.

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
