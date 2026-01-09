from __future__ import annotations

from backend.app import create_app


def test_tour_command_parse_api():
    app = create_app()
    c = app.test_client()
    r = c.post("/api/tour/command/parse", headers={"X-Client-ID": "cid1"}, json={"text": "跳到第2站", "stops": ["A", "B"]})
    assert r.status_code == 200
    p = r.get_json()
    assert p["ok"] is True
    assert p["intent"] == "tour_command"
    assert p["action"] == "jump"
    assert p["stop_index"] == 1

