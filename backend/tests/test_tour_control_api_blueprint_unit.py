from __future__ import annotations

from dataclasses import dataclass

from flask import Flask

from backend.api.tour_control import create_blueprint


@dataclass
class _State:
    paused: bool
    speed: float
    updated_at_ms: int


@dataclass
class _Cmd:
    id: int
    action: str
    payload: dict
    created_at_ms: int
    consumed_at_ms: int | None = None


class _Store:
    def __init__(self):
        self.state: _State | None = None
        self.effective_status = "waiting"
        self.queue_depth = 0
        self.commands: list[_Cmd] = []
        self.get_calls: list[tuple] = []
        self.add_calls: list[tuple] = []
        self.consume_calls: list[tuple] = []
        self.add_return = 11
        self.consume_return = True

    def get_state(self, *, client_id: str):
        self.get_calls.append(("get_state", str(client_id)))
        return self.state

    def get_effective_status(self, *, client_id: str):
        self.get_calls.append(("get_effective_status", str(client_id)))
        return str(self.effective_status)

    def get_queue_depth(self, *, client_id: str):
        self.get_calls.append(("get_queue_depth", str(client_id)))
        return int(self.queue_depth)

    def list_commands(self, *, client_id: str, since_id: int, limit: int):
        self.get_calls.append(("list_commands", str(client_id), int(since_id), int(limit)))
        return list(self.commands)

    def add_command(self, *, client_id: str, action: str, payload: dict):
        self.add_calls.append((str(client_id), str(action), dict(payload)))
        return int(self.add_return)

    def consume(self, *, client_id: str, command_id: int):
        self.consume_calls.append((str(client_id), int(command_id)))
        return bool(self.consume_return)


class _Events:
    def __init__(self):
        self.items: list[dict] = []

    def emit(self, **kwargs):  # noqa: ANN003
        self.items.append(dict(kwargs))


class _Deps:
    def __init__(self):
        self.tour_control_store = _Store()
        self.event_store = _Events()


def _app(deps: _Deps):
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app


def test_tour_control_get_parses_query_and_state_payload():
    deps = _Deps()
    deps.tour_control_store.state = _State(paused=False, speed=1.25, updated_at_ms=1234)
    deps.tour_control_store.effective_status = "queued"
    deps.tour_control_store.queue_depth = 2
    deps.tour_control_store.commands = [
        _Cmd(id=7, action="pause", payload={"a": 1}, created_at_ms=1000, consumed_at_ms=None),
        _Cmd(id=8, action="resume", payload={}, created_at_ms=1100, consumed_at_ms=1200),
    ]
    client = _app(deps).test_client()

    resp = client.get("/api/tour/control?since_id=x&limit=bad", headers={"X-Client-ID": "cid_1"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["client_id"] == "cid_1"
    assert body["state"]["status"] == "queued"
    assert body["state"]["queue_depth"] == 2
    assert body["state"]["paused"] is False
    assert abs(float(body["state"]["speed"]) - 1.25) < 1e-6
    assert body["commands"][0]["id"] == 7
    assert body["commands"][1]["consumed_at_ms"] == 1200
    assert ("list_commands", "cid_1", 0, 50) in deps.tour_control_store.get_calls


def test_tour_control_post_requires_action_and_handles_save_failed():
    deps = _Deps()
    client = _app(deps).test_client()

    missing = client.post("/api/tour/control", json={})
    assert missing.status_code == 400
    assert missing.get_json()["error"] == "action_required"

    deps.tour_control_store.add_return = 0
    failed = client.post("/api/tour/control", json={"action": "pause"})
    assert failed.status_code == 500
    assert failed.get_json()["error"] == "save_failed"
    assert deps.event_store.items == []


def test_tour_control_post_success_normalizes_action_payload_and_emits_event():
    deps = _Deps()
    deps.tour_control_store.add_return = 19
    client = _app(deps).test_client()

    resp = client.post(
        "/api/tour/control",
        headers={"X-Client-ID": "cid_h"},
        json={"action": " ReSuMe ", "payload": "not-dict"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["client_id"] == "cid_h"
    assert body["command_id"] == 19
    assert deps.tour_control_store.add_calls[-1] == ("cid_h", "resume", {})
    assert deps.event_store.items[-1]["name"] == "tour_control"
    assert deps.event_store.items[-1]["action"] == "resume"


def test_tour_control_consume_validates_command_id_and_returns_consumed_flag():
    deps = _Deps()
    client = _app(deps).test_client()

    bad = client.post("/api/tour/control/consume", json={"command_id": "x"})
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "command_id_required"

    deps.tour_control_store.consume_return = False
    ok = client.post("/api/tour/control/consume", headers={"X-Client-ID": "cid_c"}, json={"command_id": 5})
    assert ok.status_code == 200
    body = ok.get_json()
    assert body["ok"] is True
    assert body["consumed"] is False
    assert body["command_id"] == 5
    assert deps.tour_control_store.consume_calls[-1] == ("cid_c", 5)
