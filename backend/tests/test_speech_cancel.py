from __future__ import annotations

from types import SimpleNamespace

from backend.api.speech_cancel import handle_cancel_request


class _Registry:
    def __init__(self):
        self.calls: list[tuple] = []
        self.active_calls: list[tuple] = []

    def cancel(self, request_id: str, *, reason: str):
        self.calls.append((request_id, reason))
        return True

    def cancel_active(self, *, client_id: str, kind: str, reason: str):
        self.active_calls.append((client_id, kind, reason))
        return "r_active"


class _Events:
    def __init__(self):
        self.items: list[dict] = []

    def emit(self, **kwargs):
        self.items.append(dict(kwargs))


class _Logger:
    def __init__(self):
        self.infos: list[str] = []

    def info(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.infos.append(str(msg))


class _Deps:
    def __init__(self):
        self.request_registry = _Registry()
        self.event_store = _Events()
        self.logger = _Logger()


def _req(headers=None):
    return SimpleNamespace(headers=dict(headers or {}))


def test_cancel_by_request_id():
    deps = _Deps()
    out = handle_cancel_request(deps=deps, req=_req({"X-Client-ID": "c1"}), data={"request_id": "r1", "reason": "manual"})
    assert out["cancelled"] is True
    assert out["request_id"] == "r1"
    assert deps.request_registry.calls == [("r1", "manual")]
    assert deps.event_store.items[-1]["name"] == "cancel"


def test_cancel_active_when_request_id_missing():
    deps = _Deps()
    out = handle_cancel_request(deps=deps, req=_req({"X-Client-ID": "c9"}), data={})
    assert out["cancelled"] is True
    assert out["request_id"] == "r_active"
    assert deps.request_registry.active_calls == [("c9", "ask", "client_cancel")]
