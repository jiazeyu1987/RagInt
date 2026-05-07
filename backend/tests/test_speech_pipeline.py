from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.api.speech_pipeline import AskContext, LifecycleStreamMiddleware, apply_stream_middlewares
from backend.api.speech_pipeline import RecordingStreamMiddleware
from backend.orchestrators.stream_payloads import make_chunk


class _Events:
    def __init__(self):
        self.events: list[dict] = []

    def emit(self, **kw):
        self.events.append(dict(kw))


class _Registry:
    def __init__(self):
        self.clears: list[tuple] = []
        self.cancels: list[tuple] = []

    def clear_active(self, *, client_id: str, kind: str, request_id: str):
        self.clears.append((client_id, kind, request_id))

    def cancel(self, request_id: str, *, reason: str):
        self.cancels.append((request_id, reason))
        return True


class _Logger:
    def __init__(self):
        self.infos: list[str] = []
        self.errors: list[str] = []

    def info(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.infos.append(str(msg))

    def error(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.errors.append(str(msg))


class _Deps:
    def __init__(self):
        self.event_store = _Events()
        self.request_registry = _Registry()
        self.logger = _Logger()
        self.recording_store = None


class _FailingRecordingStore:
    def add_ask_event(self, *, recording_id: str, stop_index: int, request_id: str, kind: str, text: str | None):
        raise RuntimeError("recording_write_failed")


def _drain(gen):
    items = []
    for x in gen:
        items.append(x)
    return items


def test_lifecycle_emits_start_and_done_and_clears_active():
    deps = _Deps()
    parsed = SimpleNamespace(request_id="r1", client_id="c1", kind="ask", agent_id="")
    ctx = AskContext(deps=deps, parsed=parsed, data={}, t_submit=0.0)

    def raw():
        yield make_chunk("a", done=False)
        yield make_chunk("b", done=False)

    out = apply_stream_middlewares(ctx, raw(), [LifecycleStreamMiddleware()])
    items = _drain(out)

    assert [i["chunk"] for i in items] == ["a", "b"]
    names = [e.get("name") for e in deps.event_store.events]
    assert "ask_stream_start" in names
    assert "ask_done" in names
    assert deps.request_registry.clears == [("c1", "ask", "r1")]


def test_lifecycle_on_exception_emits_failed_and_reraises():
    deps = _Deps()
    parsed = SimpleNamespace(request_id="r1", client_id="c1", kind="ask", agent_id="")
    ctx = AskContext(deps=deps, parsed=parsed, data={}, t_submit=0.0)

    def raw():
        yield make_chunk("x", done=False)
        raise RuntimeError("boom")

    out = apply_stream_middlewares(ctx, raw(), [LifecycleStreamMiddleware()])
    assert next(out)["chunk"] == "x"
    with pytest.raises(RuntimeError, match="boom"):
        next(out)
    names = [e.get("name") for e in deps.event_store.events]
    assert "ask_stream_failed" in names
    assert deps.request_registry.clears == [("c1", "ask", "r1")]


def test_lifecycle_agent_no_data_error_is_not_converted_to_success_chunk():
    deps = _Deps()
    parsed = SimpleNamespace(request_id="r1", client_id="c1", kind="agent", agent_id="agent_1")
    ctx = AskContext(deps=deps, parsed=parsed, data={}, t_submit=0.0)

    def raw():
        raise RuntimeError("ragflow_agent_completion_no_data")
        yield make_chunk("unreachable", done=False)

    out = apply_stream_middlewares(ctx, raw(), [LifecycleStreamMiddleware()])
    with pytest.raises(RuntimeError, match="ragflow_agent_completion_no_data"):
        next(out)
    names = [e.get("name") for e in deps.event_store.events]
    assert "ask_stream_failed" in names
    assert deps.request_registry.clears == [("c1", "agent", "r1")]


def test_lifecycle_on_close_cancels_and_emits_disconnect():
    deps = _Deps()
    parsed = SimpleNamespace(request_id="r1", client_id="c1", kind="ask", agent_id="")
    ctx = AskContext(deps=deps, parsed=parsed, data={}, t_submit=0.0)

    def raw():
        while True:
            yield make_chunk("x", done=False)

    wrapped = apply_stream_middlewares(ctx, raw(), [LifecycleStreamMiddleware()])
    first = next(wrapped)
    assert first["chunk"] == "x"
    wrapped.close()

    names = [e.get("name") for e in deps.event_store.events]
    assert "ask_client_disconnect" in names
    assert deps.request_registry.cancels == [("r1", "client_disconnect")]
    assert deps.request_registry.clears == [("c1", "ask", "r1")]


def test_recording_write_failure_marks_stream_failed_and_reraises():
    deps = _Deps()
    deps.recording_store = _FailingRecordingStore()
    parsed = SimpleNamespace(
        request_id="r1",
        client_id="c1",
        kind="ask",
        agent_id="",
        recording_id="rec1",
        stop_index=2,
        tour_action="go",
    )
    ctx = AskContext(deps=deps, parsed=parsed, data={}, t_submit=0.0)

    out = apply_stream_middlewares(
        ctx,
        iter([make_chunk("x", done=False)]),
        [RecordingStreamMiddleware(), LifecycleStreamMiddleware()],
    )

    with pytest.raises(RuntimeError, match="recording_write_failed"):
        next(out)
    names = [e.get("name") for e in deps.event_store.events]
    assert "ask_stream_failed" in names
    assert deps.request_registry.clears == [("c1", "ask", "r1")]
