from __future__ import annotations

from flask import Flask

from backend.api.speech_rate_limit import maybe_rate_limited_response


class _Registry:
    def __init__(self, allow: bool):
        self._allow = bool(allow)
        self.calls: list[tuple] = []

    def rate_allow(self, client_id: str, kind: str, *, limit: int, window_s: float) -> bool:
        self.calls.append((client_id, kind, limit, window_s))
        return bool(self._allow)


class _Logger:
    def __init__(self):
        self.warnings: list[str] = []

    def warning(self, msg: str) -> None:
        self.warnings.append(str(msg))


class _EventStore:
    def __init__(self):
        self.events: list[dict] = []

    def emit(self, **kw):
        self.events.append(dict(kw))


class _Deps:
    def __init__(self, allow: bool):
        self.request_registry = _Registry(allow=allow)
        self.logger = _Logger()
        self.event_store = _EventStore()


def test_maybe_rate_limited_response_allows_returns_none():
    app = Flask(__name__)
    deps = _Deps(allow=True)
    with app.app_context():
        resp = maybe_rate_limited_response(deps=deps, client_id="c1", kind="ask", request_id="r1", t_submit=0.0)
        assert resp is None
        assert deps.request_registry.calls
        assert deps.event_store.events == []


def test_maybe_rate_limited_response_denied_returns_sse_and_emits():
    app = Flask(__name__)
    deps = _Deps(allow=False)
    with app.app_context():
        resp = maybe_rate_limited_response(deps=deps, client_id="c1", kind="ask_prefetch", request_id="r1", t_submit=0.0)
        assert resp is not None
        body = resp.get_data(as_text=True)
        assert "data: " in body
        assert "请求过于频繁" in body
        assert deps.event_store.events and deps.event_store.events[-1]["name"] == "ask_rate_limited"

