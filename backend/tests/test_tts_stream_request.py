from __future__ import annotations

from flask import Flask, request

from backend.api.tts_stream_request import emit_tts_stream_request_received, parse_tts_stream_request


class _Cancel:
    def __init__(self, val=False):
        self.val = val

    def is_set(self):
        return self.val


class _Registry:
    def __init__(self):
        self.cancel_event = _Cancel(False)

    def get_cancel_event(self, request_id: str):  # noqa: ARG002
        return self.cancel_event


class _Events:
    def __init__(self):
        self.items: list[dict] = []

    def emit(self, **kwargs):
        self.items.append(dict(kwargs))


class _Deps:
    def __init__(self):
        self.request_registry = _Registry()
        self.event_store = _Events()


def test_parse_tts_stream_request_success():
    app = Flask(__name__)
    deps = _Deps()
    data = {"text": "hi", "segment_index": 1, "stop_index": "2", "recording_id": "r1"}
    with app.test_request_context("/api/text_to_speech_stream", method="POST", json=data):
        parsed, err = parse_tts_stream_request(deps=deps, req=request, data=data)
    assert err is None
    assert parsed is not None
    assert parsed.text == "hi"
    assert parsed.segment_index == 1
    assert parsed.stop_index == 2
    assert parsed.recording_id == "r1"
    assert parsed.request_id.startswith("tts_")


def test_parse_tts_stream_request_missing_text():
    app = Flask(__name__)
    deps = _Deps()
    with app.test_request_context("/api/text_to_speech_stream", method="POST", json={}):
        parsed, err = parse_tts_stream_request(deps=deps, req=request, data={})
    assert parsed is None
    assert err == {"error": "No text"}


def test_parse_tts_stream_request_invalid_stop_index_fails_fast():
    app = Flask(__name__)
    deps = _Deps()
    data = {"text": "hi", "stop_index": "not-an-int"}
    with app.test_request_context("/api/text_to_speech_stream", method="POST", json=data):
        parsed, err = parse_tts_stream_request(deps=deps, req=request, data=data)
    assert parsed is None
    assert err == {"error": "Invalid stop_index"}


def test_emit_tts_stream_request_received():
    app = Flask(__name__)
    deps = _Deps()
    data = {"text": "hello", "segment_index": 3}
    with app.test_request_context("/api/text_to_speech_stream", method="POST", json=data):
        parsed, _ = parse_tts_stream_request(deps=deps, req=request, data=data)
        emit_tts_stream_request_received(deps=deps, req=request, parsed=parsed, endpoint="/api/text_to_speech_stream")
    evt = deps.event_store.items[-1]
    assert evt["name"] == "tts_request_received"
    assert evt["endpoint"] == "/api/text_to_speech_stream"
    assert evt["method"] == "POST"
    assert evt["segment_index"] == 3
