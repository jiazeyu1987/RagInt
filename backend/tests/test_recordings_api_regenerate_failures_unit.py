from __future__ import annotations

import shutil
import uuid
import wave
from pathlib import Path

import pytest
from flask import Flask

import backend.api.recordings as recordings_module
from backend.api.recordings import create_blueprint
from backend.services.recording_store import RecordingStore


class _Logger:
    def __init__(self):
        self.infos: list[str] = []
        self.warnings: list[str] = []
        self.errors: list[str] = []

    def info(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.infos.append(str(msg))

    def warning(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.warnings.append(str(msg))

    def error(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.errors.append(str(msg))


class _TtsSvc:
    def __init__(self, *, mode: str = "ok"):
        self.mode = str(mode)
        self.calls: list[dict] = []

    def stream(self, **kwargs):  # noqa: ANN003
        self.calls.append(dict(kwargs))
        if self.mode == "raise":
            raise RuntimeError("tts boom")
        if self.mode == "empty":
            return
        # Raw PCM16LE bytes; API layer wraps to WAV via ensure_wav_bytes.
        yield b"\x00\x00" * 320


class _RagflowService:
    def load_config(self, *, force: bool = False):  # noqa: ARG002
        return {
            "tts": {
                "provider": "edge",
                "edge": {
                    "enabled": True,
                    "output_format": "riff-16khz-16bit-mono-pcm",
                },
            }
        }


class _Deps:
    def __init__(self, work_dir: Path, *, tts_mode: str = "ok"):
        self.logger = _Logger()
        self.recording_store = RecordingStore(work_dir / "recordings", logger=self.logger)
        self.tts_service = _TtsSvc(mode=tts_mode)
        self.ragflow_service = _RagflowService()


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"recordings_api_test_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _build_app(work_dir: Path, *, tts_mode: str = "ok") -> tuple[Flask, _Deps]:
    deps = _Deps(work_dir, tts_mode=tts_mode)
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app, deps


def _write_wav(path: Path, *, duration_ms: int = 100, sample_rate: int = 16000) -> None:
    frames = max(1, round((duration_ms / 1000) * sample_rate))
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * frames)


def _seed_segment(deps: _Deps, *, recording_id: str = "rec_test") -> int:
    deps.recording_store.create(recording_id=recording_id, stops=["Stop A"])
    _write_wav(deps.recording_store.audio_dir(recording_id) / "ask_1_0.wav")
    deps.recording_store.add_tts_audio(
        recording_id=recording_id,
        stop_index=0,
        request_id="ask_1",
        segment_index=0,
        text="old text",
        rel_path="ask_1_0.wav",
    )
    payload = deps.recording_store.get_stop_payload(recording_id=recording_id, stop_index=0, base_url="http://localhost")
    assert payload and payload.get("segments")
    return int(payload["segments"][0]["segment_id"])


def test_regenerate_segment_not_found_returns_404(work_dir: Path):
    app, deps = _build_app(work_dir, tts_mode="ok")
    deps.recording_store.create(recording_id="rec_missing", stops=["Stop A"])

    c = app.test_client()
    r = c.post("/api/recordings/rec_missing/segment/9999/regenerate", json={"text": "new text"})
    assert r.status_code == 404
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "segment_not_found"


def test_regenerate_recording_not_found_returns_404(work_dir: Path):
    app, _deps = _build_app(work_dir, tts_mode="ok")

    c = app.test_client()
    r = c.post("/api/recordings/rec_absent/segment/1/regenerate", json={"text": "new text"})
    assert r.status_code == 404
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "not_found"


def test_regenerate_segment_store_error_does_not_return_success(work_dir: Path, monkeypatch):
    app, deps = _build_app(work_dir, tts_mode="ok")
    deps.recording_store.create(recording_id="rec_store_error", stops=["Stop A"])

    def _raise_get_segment(*args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("segment lookup failed")

    monkeypatch.setattr(deps.recording_store, "get_tts_segment", _raise_get_segment)

    c = app.test_client()
    r = c.post("/api/recordings/rec_store_error/segment/1/regenerate", json={"text": "new text"})
    assert r.status_code == 500
    body = r.get_json(silent=True)
    assert not (body and body.get("ok") is True)


def test_regenerate_tts_failed_returns_502(work_dir: Path):
    app, deps = _build_app(work_dir, tts_mode="raise")
    seg_id = _seed_segment(deps, recording_id="rec_tts_fail")

    c = app.test_client()
    r = c.post(f"/api/recordings/rec_tts_fail/segment/{seg_id}/regenerate", json={"text": "new text"})
    assert r.status_code == 502
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "tts_failed"
    assert "tts boom" in str(body.get("detail") or "")


def test_regenerate_tts_empty_audio_returns_502(work_dir: Path):
    app, deps = _build_app(work_dir, tts_mode="empty")
    seg_id = _seed_segment(deps, recording_id="rec_tts_empty")

    c = app.test_client()
    r = c.post(f"/api/recordings/rec_tts_empty/segment/{seg_id}/regenerate", json={"text": "new text"})
    assert r.status_code == 502
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "tts_empty_audio"


def test_regenerate_wav_compat_failed_returns_502(work_dir: Path, monkeypatch):
    app, deps = _build_app(work_dir, tts_mode="ok")
    seg_id = _seed_segment(deps, recording_id="rec_wav_fail")

    monkeypatch.setattr(recordings_module, "ensure_wav_bytes", lambda *a, **k: b"")

    c = app.test_client()
    r = c.post(f"/api/recordings/rec_wav_fail/segment/{seg_id}/regenerate", json={"text": "new text"})
    assert r.status_code == 502
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "tts_audio_not_wav_compatible"


def test_regenerate_audio_write_failed_returns_500(work_dir: Path, monkeypatch):
    app, deps = _build_app(work_dir, tts_mode="ok")
    seg_id = _seed_segment(deps, recording_id="rec_write_fail")

    def _raise_replace(*args, **kwargs):  # noqa: ANN002, ANN003
        raise OSError("disk full")

    monkeypatch.setattr(recordings_module.os, "replace", _raise_replace)

    c = app.test_client()
    r = c.post(f"/api/recordings/rec_write_fail/segment/{seg_id}/regenerate", json={"text": "new text"})
    assert r.status_code == 500
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "audio_write_failed"
    assert "disk full" in str(body.get("detail") or "")


def test_regenerate_old_audio_cleanup_store_error_returns_500(work_dir: Path, monkeypatch):
    app, deps = _build_app(work_dir, tts_mode="ok")
    seg_id = _seed_segment(deps, recording_id="rec_cleanup_fail")

    def _raise_count(*args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("count failed")

    monkeypatch.setattr(deps.recording_store, "count_tts_rel_path_refs", _raise_count)

    c = app.test_client()
    r = c.post(f"/api/recordings/rec_cleanup_fail/segment/{seg_id}/regenerate", json={"text": "new text"})
    assert r.status_code == 500
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "old_audio_cleanup_failed"
    assert "count failed" in str(body.get("detail") or "")
