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
        self.runtime_data_dir = base_dir / "data"


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


def test_offline_manifest_missing_fails_fast(work_dir: Path):
    client = _build_app(work_dir).test_client()
    resp = client.get("/api/offline/manifest")
    assert resp.status_code == 503
    body = resp.get_json()
    assert body["ok"] is False
    assert body["error"] == "offline_manifest_missing"
    assert "items" not in body


def test_offline_manifest_invalid_shape_fails_fast(work_dir: Path):
    root = work_dir / "data" / "offline"
    root.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text("[]", encoding="utf-8")

    client = _build_app(work_dir).test_client()
    invalid_resp = client.get("/api/offline/manifest")
    invalid_body = invalid_resp.get_json()
    assert invalid_resp.status_code == 500
    assert invalid_body["ok"] is False
    assert invalid_body["error"] == "offline_manifest_invalid"
    assert "items" not in invalid_body


def test_offline_manifest_missing_items_list_fails_fast(work_dir: Path):
    _write_manifest(work_dir, {"ok": True})

    client = _build_app(work_dir).test_client()
    resp = client.get("/api/offline/manifest")
    body = resp.get_json()

    assert resp.status_code == 500
    assert body["ok"] is False
    assert body["error"] == "offline_manifest_invalid"
    assert "items" not in body


def test_offline_manifest_parse_error_fails_fast(work_dir: Path):
    root = work_dir / "data" / "offline"
    root.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text("{", encoding="utf-8")

    client = _build_app(work_dir).test_client()
    resp = client.get("/api/offline/manifest")
    body = resp.get_json()
    assert resp.status_code == 500
    assert body["ok"] is False
    assert body["error"] == "offline_manifest_load_failed"
    assert "items" not in body


def test_offline_manifest_audio_url_normalization(work_dir: Path):
    client = _build_app(work_dir).test_client()
    _write_manifest(
        work_dir,
        {
            "ok": True,
            "items": [
                {"id": "item 1", "filename": "a.wav"},
                {"id": "custom", "audio_url": "https://example.com/c.wav", "filename": "c.wav"},
            ],
        },
    )

    resp = client.get("/api/offline/manifest")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert len(body["items"]) == 2
    assert body["items"][0]["id"] == "item 1"
    assert body["items"][0]["audio_url"] == "http://localhost/api/offline/audio/item%201"
    assert body["items"][1]["id"] == "custom"
    assert body["items"][1]["audio_url"] == "https://example.com/c.wav"


def test_offline_manifest_rejects_invalid_item_instead_of_skipping(work_dir: Path):
    client = _build_app(work_dir).test_client()
    _write_manifest(work_dir, {"ok": True, "items": ["skip-non-dict"]})

    resp = client.get("/api/offline/manifest")
    body = resp.get_json()

    assert resp.status_code == 500
    assert body["ok"] is False
    assert body["error"] == "offline_manifest_invalid"
    assert "items" not in body


def test_offline_manifest_rejects_missing_item_id_instead_of_defaulting(work_dir: Path):
    client = _build_app(work_dir).test_client()
    _write_manifest(work_dir, {"ok": True, "items": [{"filename": "b.wav"}]})

    resp = client.get("/api/offline/manifest")
    body = resp.get_json()

    assert resp.status_code == 500
    assert body["ok"] is False
    assert body["error"] == "offline_manifest_invalid"
    assert "items" not in body


def test_offline_audio_manifest_precondition_failure_is_not_not_found(work_dir: Path):
    client = _build_app(work_dir).test_client()

    resp = client.get("/api/offline/audio/anything")
    body = resp.get_json()

    assert resp.status_code == 503
    assert body["ok"] is False
    assert body["error"] == "offline_manifest_missing"


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
