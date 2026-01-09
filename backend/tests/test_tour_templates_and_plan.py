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
    r = c.post("/api/tour/plan", json={"zone": "默认路线", "profile": "大众", "duration_s": 60, "stops_override": ["A", "B"]})
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["stops"] == ["A", "B"]
    assert payload["source"] == "override"

