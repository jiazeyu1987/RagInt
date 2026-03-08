# Backend (RagInt)

## Run (development)

From repo root:

- `python -m backend`
  - ASR WS runs via VoiceKit at `/voicekit/ws/asr`
  - 依赖：建议安装 `asr-voicekit`（例如安装已构建的 wheel）
  - 若希望缺失 VoiceKit 时启动直接失败：设置 `RAGINT_REQUIRE_VOICEKIT=1`

Key endpoints:

- `GET /health`
- `GET /api/openapi.json`
- `POST /api/ask` (SSE)
- `POST /api/text_to_speech`
- `GET|POST|DELETE /api/breakpoint` (client breakpoint persistence)
- `GET|POST /api/tour/control` (on-site control panel command bus)
- `GET /api/tour/templates` (basic tour templates)
- `POST /api/tour/plan` (tour plan; supports `stops_override`)
- `POST /api/tour/command/parse` (voice tour commands: next/prev/jump/etc)
- `GET|POST|DELETE /api/selling_points` + `GET /api/selling_points/topn` (selling points TopN)
- `GET /ops` + `/api/ops/*` (ops console + device/config MVP)
- `GET /api/asr/sauc/health` (SAUC proxy capability check)
- `WS /api/asr/sauc/ws` (SAUC proxy for browser mic streaming)

## Environment variables

See `backend/.env.example`.

Security defaults:

- Ops APIs are closed by default when ops tokens are not configured.
  - To explicitly allow anonymous local access: `RAGINT_OPS_OPEN_ACCESS=1` (not recommended in deployment).
- Diagnostics download (`/api/diagnostics`) requires `RAGINT_DIAGNOSTICS_KEY` when configured.
  - For local debug only, you can allow no-key access via `RAGINT_DIAGNOSTICS_ALLOW_NO_KEY=1`.

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
