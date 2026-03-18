from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import pytest
from flask import Flask

from backend.api.recordings import create_blueprint
from backend.services.recording_store import RecordingStore


class _Logger:
    def info(self, *a, **k):  # noqa: ANN001, ANN003
        return None

    def warning(self, *a, **k):  # noqa: ANN001, ANN003
        return None

    def error(self, *a, **k):  # noqa: ANN001, ANN003
        return None


class _TtsSvc:
    def stream(self, **kwargs):  # noqa: ANN003
        yield b"\x00\x00" * 160


class _RagflowService:
    def load_config(self, *, force: bool = False):  # noqa: ARG002
        return {"tts": {"provider": "edge", "edge": {"output_format": "riff-16khz-16bit-mono-pcm"}}}


class _Deps:
    def __init__(self, work_dir: Path):
        self.logger = _Logger()
        self.recording_store = RecordingStore(work_dir / "recordings", logger=self.logger)
        self.tts_service = _TtsSvc()
        self.ragflow_service = _RagflowService()


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"recordings_api_routes_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _build_app(work_dir: Path) -> tuple[Flask, _Deps]:
    deps = _Deps(work_dir)
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app, deps


def test_recordings_start_requires_non_empty_stops(work_dir: Path):
    app, _deps = _build_app(work_dir)
    c = app.test_client()

    r = c.post("/api/recordings/start", json={})
    assert r.status_code == 400
    assert r.get_json()["error"] == "stops_required"

    r2 = c.post("/api/recordings/start", json={"stops": "not-list"})
    assert r2.status_code == 400
    assert r2.get_json()["error"] == "stops_required"


def test_recordings_start_list_get_finish_roundtrip(work_dir: Path):
    app, _deps = _build_app(work_dir)
    c = app.test_client()

    start = c.post(
        "/api/recordings/start",
        json={
            "recording_id": "rec_roundtrip",
            "stops": ["Stop A", "Stop B"],
            "metadata": {"tts_provider": "edge", "tts_voice": "voice-a"},
        },
    )
    assert start.status_code == 200
    body = start.get_json()
    assert body["recording_id"] == "rec_roundtrip"
    assert body["metadata"]["tts_provider"] == "edge"

    listed = c.get("/api/recordings?limit=bad")
    assert listed.status_code == 200
    items = listed.get_json()["items"]
    assert len(items) >= 1
    rec = next(it for it in items if str(it.get("recording_id")) == "rec_roundtrip")
    assert int(rec["stop_count"]) == 2

    meta = c.get("/api/recordings/rec_roundtrip")
    assert meta.status_code == 200
    m = meta.get_json()
    assert m["recording_id"] == "rec_roundtrip"
    assert m["stops"] == ["Stop A", "Stop B"]
    assert m["finished_at_ms"] is None

    finish = c.post("/api/recordings/rec_roundtrip/finish", json={"ok": True})
    assert finish.status_code == 200
    assert finish.get_json()["ok"] is True

    meta_after = c.get("/api/recordings/rec_roundtrip")
    assert meta_after.status_code == 200
    assert meta_after.get_json()["finished_at_ms"] is not None

    missing = c.get("/api/recordings/not_exists")
    assert missing.status_code == 404
    assert missing.get_json()["error"] == "not_found"


def test_recordings_stop_payload_found_and_not_found(work_dir: Path):
    app, deps = _build_app(work_dir)
    deps.recording_store.create(recording_id="rec_stop", stops=["Stop A"])
    deps.recording_store.add_ask_event(recording_id="rec_stop", stop_index=0, request_id="ask_1", kind="chunk", text="chunk_a")
    deps.recording_store.add_tts_audio(
        recording_id="rec_stop",
        stop_index=0,
        request_id="ask_1",
        segment_index=0,
        text="segment_a",
        rel_path="s0.wav",
    )

    c = app.test_client()
    ok = c.get("/api/recordings/rec_stop/stop/0")
    assert ok.status_code == 200
    body = ok.get_json()
    assert body["recording_id"] == "rec_stop"
    assert body["stop_index"] == 0
    assert body["chunks"] == ["segment_a"]
    assert body["answer_text"] == "segment_a"
    assert len(body["segments"]) == 1

    missing = c.get("/api/recordings/not_exist/stop/0")
    assert missing.status_code == 404
    assert missing.get_json()["error"] == "not_found"


def test_recordings_audio_bad_path_not_found_and_success(work_dir: Path):
    app, deps = _build_app(work_dir)
    deps.recording_store.create(recording_id="rec_audio", stops=["Stop A"])
    audio_dir = deps.recording_store.audio_dir("rec_audio")
    wav = audio_dir / "ok.wav"
    wav_bytes = b"RIFF\x00\x00\x00\x00WAVE"
    wav.write_bytes(wav_bytes)
    mp3 = audio_dir / "ok.mp3"
    mp3_bytes = b"\xFF\xFB\x90\x64\x00\x00\x00\x00LAME"
    mp3.write_bytes(mp3_bytes)

    c = app.test_client()

    bad = c.get("/api/recordings/rec_audio/audio/..%2Foutside.wav")
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "bad_path"

    missing = c.get("/api/recordings/rec_audio/audio/missing.wav")
    assert missing.status_code == 404
    assert missing.get_json()["error"] == "not_found"

    ok = c.get("/api/recordings/rec_audio/audio/ok.wav")
    assert ok.status_code == 200
    assert "audio/wav" in str(ok.headers.get("content-type", "")).lower()
    assert ok.data == wav_bytes

    ok_mp3 = c.get("/api/recordings/rec_audio/audio/ok.mp3")
    assert ok_mp3.status_code == 200
    assert "audio/mpeg" in str(ok_mp3.headers.get("content-type", "")).lower()
    assert ok_mp3.data == mp3_bytes


def test_recordings_rename_and_delete_error_paths(work_dir: Path, monkeypatch):
    app, deps = _build_app(work_dir)
    deps.recording_store.create(recording_id="rec_rename_delete", stops=["Stop A"])
    c = app.test_client()

    def _raise_rename(recording_id: str, display_name: str):  # noqa: ARG001
        raise ValueError("rename_fail")

    monkeypatch.setattr(deps.recording_store, "set_display_name", _raise_rename)
    rename = c.post("/api/recordings/rec_rename_delete/rename", json={"display_name": "New Name"})
    assert rename.status_code == 400
    rb = rename.get_json()
    assert rb["ok"] is False
    assert "rename_fail" in rb["error"]

    def _raise_delete(recording_id: str):  # noqa: ARG001
        raise RuntimeError("delete_fail")

    monkeypatch.setattr(deps.recording_store, "delete", _raise_delete)
    delete = c.delete("/api/recordings/rec_rename_delete")
    assert delete.status_code == 400
    db = delete.get_json()
    assert db["ok"] is False
    assert "delete_fail" in db["error"]
