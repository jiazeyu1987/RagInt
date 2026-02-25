from __future__ import annotations

from flask import Flask, request

from backend.api.tts_nonstream import emit_tts_request_received, parse_tts_request_context, stream_tts_audio


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


class _Logger:
    def __init__(self):
        self.infos: list[str] = []
        self.errors: list[str] = []

    def info(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.infos.append(str(msg))

    def error(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.errors.append(str(msg))


class _Tts:
    def __init__(self, fail=False):
        self.fail = fail

    def stream(self, **kwargs):  # noqa: ANN003
        if self.fail:
            raise RuntimeError("boom")
        yield b"a"
        yield b"b"


class _Deps:
    def __init__(self, fail=False):
        self.request_registry = _Registry()
        self.event_store = _Events()
        self.logger = _Logger()
        self.tts_service = _Tts(fail=fail)


def test_parse_tts_request_context_success():
    app = Flask(__name__)
    deps = _Deps()
    with app.test_request_context("/api/text_to_speech", method="POST", json={"text": "hello", "segment_index": 2}):
        ctx, err = parse_tts_request_context(deps=deps, req=request, data={"text": "hello", "segment_index": 2})
        assert err is None
        assert ctx is not None
        assert ctx.text == "hello"
        assert ctx.segment_index == 2
        assert ctx.request_id.startswith("tts_")


def test_parse_tts_request_context_missing_text():
    app = Flask(__name__)
    deps = _Deps()
    with app.test_request_context("/api/text_to_speech", method="POST", json={}):
        ctx, err = parse_tts_request_context(deps=deps, req=request, data={})
        assert ctx is None
        assert err == {"error": "No text"}


def test_emit_and_stream_tts_audio_success():
    deps = _Deps()
    app = Flask(__name__)
    with app.test_request_context("/api/text_to_speech", method="POST", json={"text": "hello"}):
        ctx, _ = parse_tts_request_context(deps=deps, req=request, data={"text": "hello"})
    emit_tts_request_received(deps=deps, ctx=ctx, endpoint="/api/text_to_speech")
    out = list(stream_tts_audio(deps=deps, ctx=ctx, app_config={}, provider="edge", endpoint="/api/text_to_speech"))
    assert out == [b"a", b"b"]
    assert deps.event_store.items[-1]["name"] == "tts_request_received"


def test_stream_tts_audio_failure_emits_error_event():
    deps = _Deps(fail=True)
    app = Flask(__name__)
    with app.test_request_context("/api/text_to_speech", method="POST", json={"text": "hello"}):
        ctx, _ = parse_tts_request_context(deps=deps, req=request, data={"text": "hello"})
    out = list(stream_tts_audio(deps=deps, ctx=ctx, app_config={}, provider="edge", endpoint="/api/text_to_speech"))
    assert out == []
    assert deps.event_store.items[-1]["name"] == "tts_failed"
