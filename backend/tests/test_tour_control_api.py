from __future__ import annotations

import os

from backend.app import create_app


def test_tour_control_command_flow(tmp_path):
    os.environ["RAGINT_TOUR_CONTROL_DB_PATH"] = str(tmp_path / "tour_control.db")
    app = create_app()
    c = app.test_client()

    headers = {"X-Client-ID": "cid_panel_1"}

    r0 = c.get("/api/tour/control?since_id=0", headers=headers)
    assert r0.status_code == 200
    p0 = r0.get_json()
    assert p0["ok"] is True
    assert p0["commands"] == []

    r1 = c.post("/api/tour/control", headers=headers, json={"action": "pause"})
    assert r1.status_code == 200
    p1 = r1.get_json()
    assert p1["ok"] is True
    cmd_id = int(p1["command_id"])
    assert cmd_id > 0

    r2 = c.get("/api/tour/control?since_id=0", headers=headers)
    p2 = r2.get_json()
    assert len(p2["commands"]) >= 1
    assert p2["commands"][0]["action"] == "pause"
    assert p2["state"]["paused"] is True
    assert p2["state"]["status"] == "paused"
    assert int(p2["state"]["queue_depth"]) >= 1

    r3 = c.post("/api/tour/control/consume", headers=headers, json={"command_id": cmd_id})
    assert r3.status_code == 200
    assert r3.get_json()["consumed"] is True

    r4 = c.get(f"/api/tour/control?since_id=0", headers=headers)
    p4 = r4.get_json()
    assert p4["state"]["status"] == "paused"
    assert int(p4["state"]["queue_depth"]) == 0

    r5 = c.post("/api/tour/control", headers=headers, json={"action": "resume"})
    assert r5.status_code == 200
    r6 = c.get("/api/tour/control?since_id=0", headers=headers)
    p6 = r6.get_json()
    assert p6["state"]["paused"] is False
    assert p6["state"]["status"] in ("playing", "queued")
