from __future__ import annotations

from backend.app import create_app


def test_tour_templates_endpoint():
    app = create_app()
    c = app.test_client()
    r = c.get("/api/tour/templates")
    assert r.status_code == 200
    payload = r.get_json()
    assert isinstance(payload.get("templates"), list)


def test_tour_plan_accepts_override():
    app = create_app()
    c = app.test_client()
    r = c.post("/api/tour/plan", json={"zone": "榛樿璺嚎", "profile": "澶т紬", "duration_s": 60, "stops_override": ["A", "B"]})
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["stops"] == ["A", "B"]
    assert payload["source"] == "override"


def test_tour_plan_accepts_stop_duration_override():
    app = create_app()
    c = app.test_client()
    r = c.post(
        "/api/tour/plan",
        json={
            "zone": "榛樿璺嚎",
            "profile": "澶т紬",
            "duration_s": 60,
            "stops_override": ["A", "B"],
            "stop_durations_s_override": {"A": 11, "B": 22},
        },
    )
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["stops"] == ["A", "B"]
    assert payload["stop_durations_s"] == [11, 22]
