from __future__ import annotations

import os

from backend.app import create_app


def test_breakpoint_roundtrip(tmp_path):
    os.environ["RAGINT_BREAKPOINT_DB_PATH"] = str(tmp_path / "bp.db")
    app = create_app()
    c = app.test_client()

    headers = {"X-Client-ID": "cid_test_1"}

    r0 = c.get("/api/breakpoint", headers=headers)
    assert r0.status_code == 200
    p0 = r0.get_json()
    assert p0["ok"] is True
    assert p0["state"] is None

    r1 = c.post("/api/breakpoint", headers=headers, json={"state": {"stopIndex": 3, "mode": "running"}})
    assert r1.status_code == 200
    p1 = r1.get_json()
    assert p1["ok"] is True
    assert p1["state"]["stopIndex"] == 3

    r2 = c.get("/api/breakpoint", headers=headers)
    assert r2.status_code == 200
    p2 = r2.get_json()
    assert p2["state"]["mode"] == "running"

    r3 = c.delete("/api/breakpoint", headers=headers)
    assert r3.status_code == 200
    p3 = r3.get_json()
    assert p3["deleted"] is True

    r4 = c.get("/api/breakpoint", headers=headers)
    assert r4.status_code == 200
    assert r4.get_json()["state"] is None

