from __future__ import annotations

from dataclasses import dataclass

from flask import Flask

from backend.api.tour_command import create_blueprint


@dataclass
class _Cmd:
    intent: str = "tour_command"
    action: str = "jump"
    confidence: float = 0.87654
    stop_index: int | None = 1
    stop_name: str | None = "Stop B"
    reason: str = "jump_name"


class _Service:
    def __init__(self):
        self.calls: list[tuple[str, list[str]]] = []
        self.out = _Cmd()

    def parse(self, *, text: str, stops: list[str]):
        self.calls.append((str(text), list(stops)))
        return self.out


class _Deps:
    def __init__(self):
        self.tour_command_service = _Service()


def _app(deps: _Deps):
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app


def test_tour_command_parse_normalizes_inputs_and_rounds_confidence():
    deps = _Deps()
    client = _app(deps).test_client()
    resp = client.post(
        "/api/tour/command/parse",
        headers={"X-Client-ID": "cid_h", "X-Request-ID": "rid_h"},
        json={
            "text": "  next stop  ",
            "stops": [" Stop A ", "", None, "Stop B", "   "],
        },
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["request_id"] == "rid_h"
    assert body["client_id"] == "cid_h"
    assert body["intent"] == "tour_command"
    assert body["action"] == "jump"
    assert abs(float(body["confidence"]) - 0.877) < 1e-9
    assert body["stop_index"] == 1
    assert body["stop_name"] == "Stop B"
    assert body["reason"] == "jump_name"
    assert deps.tour_command_service.calls[-1] == ("next stop", ["Stop A", "None", "Stop B"])


def test_tour_command_parse_uses_payload_ids_and_non_list_stops_fallback():
    deps = _Deps()
    deps.tour_command_service.out = _Cmd(intent="none", action="", confidence=0.12, stop_index=None, stop_name=None, reason="no_match")
    client = _app(deps).test_client()

    resp = client.post(
        "/api/tour/command/parse",
        headers={"X-Client-ID": "cid_header", "X-Request-ID": "rid_header"},
        json={
            "request_id": "rid_payload",
            "client_id": "cid_payload",
            "text": "hello",
            "stops": "not-a-list",
        },
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["request_id"] == "rid_payload"
    assert body["client_id"] == "cid_payload"
    assert body["intent"] == "none"
    assert body["action"] == ""
    assert abs(float(body["confidence"]) - 0.12) < 1e-9
    assert body["stop_index"] is None
    assert body["stop_name"] is None
    assert body["reason"] == "no_match"
    assert deps.tour_command_service.calls[-1] == ("hello", [])
