#!/usr/bin/env python3
from __future__ import annotations

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
from backend.frontend_host import register_frontend_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


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
        return [
            "http://localhost:4981",
            "http://127.0.0.1:4981",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ]
    items = []
    for part in str(raw).split(","):
        o = part.strip()
        if o:
            items.append(o)
    return items or [
        "http://localhost:4981",
        "http://127.0.0.1:4981",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]


def create_app() -> Flask:
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
    register_frontend_routes(app=app, repo_root=repo_root, logger=logger)

    # WebSocket endpoints (Flask-Sock / VoiceKit).
    bootstrap.register_voicekit(app=app, deps=deps, logger=logger)
    bootstrap.register_sauc_proxy(app=app, deps=deps, logger=logger)
    return app


def main() -> None:
    host = str(os.environ.get("RAGINT_HOST") or "0.0.0.0").strip() or "0.0.0.0"
    try:
        port = int(os.environ.get("RAGINT_PORT") or 8101)
    except Exception:
        port = 8101
    debug = _parse_bool(os.environ.get("RAGINT_DEBUG"), default=False)

    app = create_app()
    if debug:
        logger.warning("RAGINT_DEBUG=1 may reduce websocket stability; forcing use_reloader=False.")
    logger.info("启动语音问答后端服务")
    # Note: Flask-Sock uses `simple-websocket`, which starts a background thread to read frames.
    # Using gevent sockets here can trigger `greenlet.error: Cannot switch to a different thread`.
    # For local/dev, run with werkzeug (Flask built-in server) so websocket works reliably.
    app.run(host=host, port=port, debug=debug, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
