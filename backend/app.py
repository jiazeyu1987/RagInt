#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import logging
import os
import sys
from pathlib import Path

from flask import Flask
from flask_cors import CORS

# Allow `python backend/app.py` when executed from inside `backend/`.
# When run as a script, Python sets sys.path[0] to the script's directory
# (i.e. `<repo>/backend`), which breaks absolute imports like `import backend.*`.
if __package__ is None and __name__ == "__main__":
    repo_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(repo_root))

import backend.bootstrap as bootstrap

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class _DashscopeByeNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        if "opcode=8" in msg and "Bye" in msg and ("goodbye" in msg.lower() or "websocket closed" in msg.lower()):
            return False
        if "Websocket connected" in msg:
            return False
        if "SpeechSynthesizerObjectPool" in msg and "renew synthesizer after" in msg:
            return False
        return True


class _AccessNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        if "GET /api/status" in msg:
            return False
        if "GET /api/events" in msg:
            return False
        return True


def _install_log_filters() -> None:
    with contextlib.suppress(Exception):
        access_filter = _AccessNoiseFilter()
        bye_filter = _DashscopeByeNoiseFilter()

        root = logging.getLogger()
        root.addFilter(access_filter)
        root.addFilter(bye_filter)
        for h in list(getattr(root, "handlers", []) or []):
            h.addFilter(access_filter)
            h.addFilter(bye_filter)

        for name in ("werkzeug", "werkzeug.serving"):
            lg = logging.getLogger(name)
            lg.addFilter(access_filter)
            for h in list(getattr(lg, "handlers", []) or []):
                h.addFilter(access_filter)


for _name in (
    "dashscope.audio.tts_v2.speech_synthesizer",
    "dashscope",
    "websocket",
    "websocket._logging",
    "websocket._app",
):
    with contextlib.suppress(Exception):
        logging.getLogger(_name).addFilter(_DashscopeByeNoiseFilter())
        logging.getLogger(_name).setLevel(logging.WARNING)


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return bool(default)
    v = str(value).strip().lower()
    if v in ("1", "true", "yes", "y", "on"):
        return True
    if v in ("0", "false", "no", "n", "off"):
        return False
    return bool(default)


def _parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    items = []
    for part in str(raw).split(","):
        o = part.strip()
        if o:
            items.append(o)
    return items or ["http://localhost:3000", "http://127.0.0.1:3000"]


def create_app() -> Flask:
    _install_log_filters()

    with contextlib.suppress(Exception):
        from logging import NullHandler as _NullHandler  # type: ignore

        _ws_logger = logging.getLogger("websocket")
        for _h in list(_ws_logger.handlers):
            if not isinstance(_h, _NullHandler):
                _ws_logger.removeHandler(_h)

    app = Flask(__name__)

    repo_root = Path(__file__).resolve().parent.parent
    config_path = bootstrap.resolve_config_path(repo_root=repo_root)

    origins = _parse_cors_origins(os.environ.get("RAGINT_CORS_ORIGINS"))
    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": origins}},
        allow_headers=["Content-Type", "X-Client-ID", "X-Request-ID", "X-Recording-ID", "X-TTS-Provider", "X-TTS-Voice"],
    )

    deps = bootstrap.build_deps(base_dir=Path(__file__).parent, config_path=config_path, logger=logger)
    # Expose deps for ASGI wrapper / WS endpoints.
    app.config["deps"] = deps

    bootstrap.init_ragflow(deps=deps, logger=logger)
    bootstrap.register_blueprints(app=app, deps=deps)

    # WebSocket endpoints (Flask-Sock / VoiceKit).
    bootstrap.register_voicekit(app=app, deps=deps, logger=logger)
    return app


def main() -> None:
    host = str(os.environ.get("RAGINT_HOST") or "0.0.0.0").strip() or "0.0.0.0"
    try:
        port = int(os.environ.get("RAGINT_PORT") or 8000)
    except Exception:
        port = 8000
    debug = _parse_bool(os.environ.get("RAGINT_DEBUG"), default=False)

    app = create_app()
    logger.info("启动语音问答后端服务")
    # Note: Flask-Sock uses `simple-websocket`, which starts a background thread to read frames.
    # Using gevent sockets here can trigger `greenlet.error: Cannot switch to a different thread`.
    # For local/dev, run with werkzeug (Flask built-in server) so websocket works reliably.
    app.run(host=host, port=port, debug=debug, threaded=True)


if __name__ == "__main__":
    main()
