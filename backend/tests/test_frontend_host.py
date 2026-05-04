from __future__ import annotations

import logging

from flask import Flask

from backend.frontend_host import register_frontend_routes


def test_register_frontend_routes_serves_pad_and_ragint(tmp_path, monkeypatch):
    repo_root = tmp_path / "repo"
    pad_root = repo_root / "pad-frontend"
    ragint_root = repo_root / "fronted" / "build-ragint"
    pad_root.mkdir(parents=True)
    ragint_root.mkdir(parents=True)

    (pad_root / "index.html").write_text("PAD_HOME", encoding="utf-8")
    (pad_root / "app.js").write_text("console.log('pad')", encoding="utf-8")
    (pad_root / "modules").mkdir()
    (pad_root / "modules" / "runtime.js").write_text("module", encoding="utf-8")
    (ragint_root / "index.html").write_text("RAGINT_HOME", encoding="utf-8")
    (ragint_root / "main.js").write_text("console.log('ragint')", encoding="utf-8")

    monkeypatch.delenv("RAGINT_PAD_FRONTEND_DIR", raising=False)
    monkeypatch.delenv("RAGINT_RAGINT_FRONTEND_DIR", raising=False)

    app = Flask(__name__)

    @app.route("/ops")
    def ops_console():
        return "OPS"

    register_frontend_routes(app=app, repo_root=repo_root, logger=logging.getLogger("test_frontend_host"))

    client = app.test_client()

    assert client.get("/").data == b"PAD_HOME"
    assert client.get("/app.js").status_code == 200
    assert client.get("/modules/runtime.js").status_code == 200
    assert client.get("/missing-page").data == b"PAD_HOME"
    assert client.get("/ragint").status_code == 302
    assert client.get("/ragint/").data == b"RAGINT_HOME"
    assert client.get("/ragint/main.js").status_code == 200
    assert client.get("/api/not-registered").status_code == 404
    assert client.get("/voicekit/ws/asr").status_code == 404
    assert client.get("/ops").data == b"OPS"
