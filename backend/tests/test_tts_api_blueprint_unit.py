from __future__ import annotations

from pathlib import Path

from flask import Flask

from backend.api.tts import create_blueprint


class _Cancel:
    def __init__(self, value=False):
        self.value = value

    def is_set(self):
        return self.value


class _Registry:
    def __init__(self):
        self.cancel = _Cancel(False)

    def get_cancel_event(self, request_id: str):  # noqa: ARG002
        return self.cancel


class _Events:
    def __init__(self):
        self.items: list[dict] = []

    def emit(self, **kwargs):
        self.items.append(dict(kwargs))


class _Logger:
    def info(self, *a, **k):  # noqa: ANN001, ANN003
        return None

    def error(self, *a, **k):  # noqa: ANN001, ANN003
        return None

    def warning(self, *a, **k):  # noqa: ANN001, ANN003
        return None


class _TtsSvc:
    def stream(self, **kwargs):  # noqa: ANN003
        yield b"abc"

    def tts_state_update(self, *a, **k):  # noqa: ANN001, ANN003
        return None


class _AskTimings:
    def get(self, request_id: str):  # noqa: ARG002
        return {"t_submit": 0.0}

    def set(self, request_id: str, **kwargs):  # noqa: ARG002
        return None


class _RecordingStore:
    def audio_dir(self, recording_id: str):  # noqa: ARG002
        return Path(".")

    def add_tts_audio(self, **kwargs):  # noqa: ANN003
        return None


class _RagflowService:
    def load_config(self, *, force: bool = False):  # noqa: ARG002
        return {"tts": {"provider": "edge", "mimetype": "audio/wav", "edge": {"rate": "0%"}}}


class _Deps:
    def __init__(self):
        self.request_registry = _Registry()
        self.event_store = _Events()
        self.logger = _Logger()
        self.tts_service = _TtsSvc()
        self.ask_timings = _AskTimings()
        self.recording_store = _RecordingStore()
        self.ragflow_service = _RagflowService()


def _app():
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps()))
    return app


def test_tts_nonstream_returns_400_without_text():
    c = _app().test_client()
    r = c.post("/api/text_to_speech", json={})
    assert r.status_code == 400
    assert r.get_json()["error"] == "No text"


def test_tts_nonstream_returns_audio_stream():
    c = _app().test_client()
    r = c.post("/api/text_to_speech", json={"text": "hello"})
    assert r.status_code == 200
    assert (r.headers.get("content-type") or "").startswith("audio/wav")
    assert r.data == b"abc"


def test_tts_stream_returns_400_without_text():
    c = _app().test_client()
    r = c.post("/api/text_to_speech_stream", json={})
    assert r.status_code == 400
    assert r.get_json()["error"] == "No text"


def test_tts_stream_returns_audio_stream():
    c = _app().test_client()
    r = c.post("/api/text_to_speech_stream", json={"text": "hello"})
    assert r.status_code == 200
    assert (r.headers.get("content-type") or "").startswith("audio/wav")
    assert r.data == b"abc"
