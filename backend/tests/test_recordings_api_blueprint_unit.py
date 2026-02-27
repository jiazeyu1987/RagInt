from __future__ import annotations

from pathlib import Path

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
        # Raw PCM16LE bytes; API layer wraps into WAV via ensure_wav_bytes.
        yield b"\x00\x00" * 320


class _RagflowService:
    def load_config(self, *, force: bool = False):  # noqa: ARG002
        return {
            "tts": {
                "provider": "edge",
                "mimetype": "audio/wav",
                "edge": {
                    "enabled": True,
                    "output_format": "riff-16khz-16bit-mono-pcm",
                },
            }
        }


class _Deps:
    def __init__(self, tmp_path: Path):
        self.logger = _Logger()
        self.recording_store = RecordingStore(Path(tmp_path), logger=self.logger)
        self.tts_service = _TtsSvc()
        self.ragflow_service = _RagflowService()


def _build_app(tmp_path: Path) -> tuple[Flask, _Deps]:
    deps = _Deps(tmp_path)
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app, deps


def _seed_recording(deps: _Deps, recording_id: str = "rec_test") -> int:
    deps.recording_store.create(recording_id=recording_id, stops=["站点A"])
    deps.recording_store.add_tts_audio(
        recording_id=recording_id,
        stop_index=0,
        request_id="ask_1",
        segment_index=0,
        text="旧文本",
        rel_path="ask_1_0.wav",
    )
    payload = deps.recording_store.get_stop_payload(recording_id=recording_id, stop_index=0, base_url="http://localhost")
    assert payload and payload.get("segments")
    return int(payload["segments"][0]["segment_id"])


def test_recording_segment_regenerate_updates_text_and_audio_url(tmp_path: Path):
    app, deps = _build_app(tmp_path)
    seg_id = _seed_recording(deps, recording_id="rec_regen")

    c = app.test_client()
    r = c.post(
        f"/api/recordings/rec_regen/segment/{seg_id}/regenerate",
        json={"text": "新的段落文本", "tts_provider": "edge", "tts_speed": 1.0},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["ok"] is True
    assert body["segment"]["segment_id"] == seg_id
    assert body["segment"]["text"] == "新的段落文本"
    assert "/api/recordings/rec_regen/audio/" in body["segment"]["audio_url"]
    assert "?v=" in body["segment"]["audio_url"]

    stop_payload = deps.recording_store.get_stop_payload(recording_id="rec_regen", stop_index=0, base_url="http://localhost")
    assert stop_payload and stop_payload.get("segments")
    assert stop_payload["segments"][0]["segment_id"] == seg_id
    assert stop_payload["segments"][0]["text"] == "新的段落文本"
    assert stop_payload["chunks"] == ["新的段落文本"]
    assert stop_payload["answer_text"] == "新的段落文本"

    seg_row = deps.recording_store.get_tts_segment(recording_id="rec_regen", segment_id=seg_id)
    assert seg_row is not None
    assert str(seg_row["rel_path"]).endswith(".wav")
    audio_file = deps.recording_store.safe_rel_audio_path("rec_regen", str(seg_row["rel_path"]))
    assert audio_file.exists() and audio_file.is_file()


def test_recording_segment_regenerate_requires_text(tmp_path: Path):
    app, deps = _build_app(tmp_path)
    seg_id = _seed_recording(deps, recording_id="rec_regen_empty")

    c = app.test_client()
    r = c.post(f"/api/recordings/rec_regen_empty/segment/{seg_id}/regenerate", json={"text": "  "})
    assert r.status_code == 400
    body = r.get_json()
    assert body["ok"] is False
    assert body["error"] == "text_required"
