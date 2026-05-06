from __future__ import annotations

from pathlib import Path

import pytest
from flask import Flask

from backend.api.qa_audio_cache import _detect_audio_mimetype, create_blueprint


class _Deps:
    def __init__(self, base: Path):
        self._base = base
        self.qa_audio_cache_store = self

    def get_audio_file_path(self, pair_id: int):
        pid = int(pair_id)
        if pid == 1:
            return (self._base / "pair_1.wav").resolve()
        if pid == 2:
            # Keep .wav extension on purpose; MIME should follow file header.
            return (self._base / "pair_2.wav").resolve()
        return None


class _MissingStoreDeps:
    pass


class _FailingStoreDeps:
    def __init__(self):
        self.qa_audio_cache_store = self

    def get_audio_file_path(self, pair_id: int):
        raise RuntimeError(f"store unavailable for pair {pair_id}")


def _build_app(tmp_path: Path) -> Flask:
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps(tmp_path)))
    return app


def _build_app_with_deps(deps) -> Flask:
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app


def test_qa_audio_cache_api_detects_mimetype_from_bytes(tmp_path: Path):
    (tmp_path / "pair_1.wav").write_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt ")
    (tmp_path / "pair_2.wav").write_bytes(b"ID3\x04\x00\x00\x00\x00\x00\x10")

    c = _build_app(tmp_path).test_client()

    wav_resp = c.get("/api/qa_audio_cache/audio/1")
    assert wav_resp.status_code == 200
    assert "audio/wav" in str(wav_resp.headers.get("content-type", "")).lower()

    mp3_resp = c.get("/api/qa_audio_cache/audio/2")
    assert mp3_resp.status_code == 200
    assert "audio/mpeg" in str(mp3_resp.headers.get("content-type", "")).lower()

    miss = c.get("/api/qa_audio_cache/audio/999")
    assert miss.status_code == 404
    assert miss.get_json()["error"] == "not_found"


def test_qa_audio_cache_api_rejects_unknown_audio_header_without_octet_stream(tmp_path: Path):
    (tmp_path / "pair_1.wav").write_bytes(b"not-a-real-wav")

    resp = _build_app(tmp_path).test_client().get("/api/qa_audio_cache/audio/1")

    assert resp.status_code == 415
    assert resp.get_json()["error"] == "audio_format_unsupported"


def test_qa_audio_cache_api_returns_500_when_store_dependency_is_missing():
    c = _build_app_with_deps(_MissingStoreDeps()).test_client()

    resp = c.get("/api/qa_audio_cache/audio/1")

    assert resp.status_code == 500


def test_qa_audio_cache_api_returns_500_when_store_lookup_raises():
    c = _build_app_with_deps(_FailingStoreDeps()).test_client()

    resp = c.get("/api/qa_audio_cache/audio/1")

    assert resp.status_code == 500


def test_detect_audio_mimetype_raises_when_audio_file_cannot_be_read(tmp_path: Path):
    missing_path = tmp_path / "missing.wav"

    with pytest.raises(FileNotFoundError):
        _detect_audio_mimetype(str(missing_path))
