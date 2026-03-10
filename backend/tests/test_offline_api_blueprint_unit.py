from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

import pytest
from flask import Flask

from backend.api.offline import create_blueprint


class _Deps:
    def __init__(self, base_dir: Path):
        self.base_dir = str(base_dir)


def _build_app(tmp_path: Path) -> Flask:
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps(tmp_path)))
    return app


def _write_manifest(tmp_path: Path, payload) -> None:
    root = tmp_path / "data" / "offline"
    root.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"offline_api_test_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def test_offline_manifest_missing_returns_default_error(work_dir: Path):
    client = _build_app(work_dir).test_client()
    resp = client.get("/api/offline/manifest")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is False
    assert body["error"] == "offline_manifest_missing"
    assert body["items"] == []


def test_offline_manifest_invalid_shape_and_audio_url_normalization(work_dir: Path):
    # Invalid shape (list) should be normalized to invalid error payload.
    root = work_dir / "data" / "offline"
    root.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text("[]", encoding="utf-8")

    client = _build_app(work_dir).test_client()
    invalid_resp = client.get("/api/offline/manifest")
    invalid_body = invalid_resp.get_json()
    assert invalid_resp.status_code == 200
    assert invalid_body["ok"] is False
    assert invalid_body["error"] == "offline_manifest_invalid"
    assert invalid_body["items"] == []

    _write_manifest(
        work_dir,
        {
            "ok": True,
            "items": [
                {"id": "item 1", "filename": "a.wav"},
                {"filename": "b.wav"},
                {"id": "custom", "audio_url": "https://example.com/c.wav", "filename": "c.wav"},
                "skip-non-dict",
            ],
        },
    )

    resp = client.get("/api/offline/manifest")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert len(body["items"]) == 3
    assert body["items"][0]["id"] == "item 1"
    assert body["items"][0]["audio_url"] == "http://localhost/api/offline/audio/item%201"
    assert body["items"][1]["id"] == "1"
    assert body["items"][1]["audio_url"] == "http://localhost/api/offline/audio/1"
    assert body["items"][2]["id"] == "custom"
    assert body["items"][2]["audio_url"] == "https://example.com/c.wav"


def test_offline_audio_bad_path_and_missing_file(work_dir: Path):
    client = _build_app(work_dir).test_client()

    _write_manifest(work_dir, {"ok": True, "items": [{"id": "bad", "filename": "../outside.wav"}]})
    bad_resp = client.get("/api/offline/audio/bad")
    assert bad_resp.status_code == 400
    assert bad_resp.get_json()["error"] == "bad_path"

    _write_manifest(work_dir, {"ok": True, "items": [{"id": "missing", "filename": "missing.wav"}]})
    missing_resp = client.get("/api/offline/audio/missing")
    assert missing_resp.status_code == 404
    assert missing_resp.get_json()["error"] == "audio_missing"


def test_offline_audio_serves_existing_file(work_dir: Path):
    audio_dir = work_dir / "data" / "offline" / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    wav_bytes = b"RIFF\x00\x00\x00\x00WAVE"
    (audio_dir / "ok.wav").write_bytes(wav_bytes)
    _write_manifest(work_dir, {"ok": True, "items": [{"id": "ok", "filename": "ok.wav"}]})

    client = _build_app(work_dir).test_client()
    resp = client.get("/api/offline/audio/ok")
    assert resp.status_code == 200
    assert "audio/wav" in str(resp.headers.get("content-type", "")).lower()
    assert resp.data == wav_bytes
