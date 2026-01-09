from __future__ import annotations

import os

from backend.app import create_app


def test_ops_heartbeat_and_config_flow(tmp_path):
    os.environ["RAGINT_OPS_DB_PATH"] = str(tmp_path / "ops.db")
    # no token => open ops admin endpoints for tests
    os.environ.pop("RAGINT_OPS_TOKEN", None)
    os.environ.pop("RAGINT_OPS_ADMIN_TOKEN", None)
    os.environ.pop("RAGINT_OPS_VIEW_TOKEN", None)
    os.environ.pop("RAGINT_DEVICE_SHARED_SECRET", None)
    os.environ.pop("RAGINT_DEVICE_AUTH_REQUIRED", None)

    app = create_app()
    c = app.test_client()

    r1 = c.post("/api/ops/heartbeat", json={"device_id": "d1", "name": "robot1", "model": "m1", "version": "v1", "meta": {"ip": "1.2.3.4"}})
    assert r1.status_code == 200
    assert r1.get_json()["ok"] is True

    r2 = c.get("/api/ops/devices")
    assert r2.status_code == 200
    items = r2.get_json()["items"]
    assert any(x["device_id"] == "d1" for x in items)

    r3 = c.get("/api/ops/config?device_id=d1")
    assert r3.status_code == 200
    assert r3.get_json()["config_version"] == 0

    r4 = c.post("/api/ops/config", json={"device_id": "d1", "config": {"k": "v"}})
    assert r4.status_code == 200
    assert r4.get_json()["config_version"] == 1

    r5 = c.get("/api/ops/config?device_id=d1")
    assert r5.status_code == 200
    assert r5.get_json()["config_version"] == 1
    assert r5.get_json()["config"]["k"] == "v"


def test_ops_token_protects_admin_endpoints(tmp_path):
    os.environ["RAGINT_OPS_DB_PATH"] = str(tmp_path / "ops.db")
    os.environ.pop("RAGINT_OPS_TOKEN", None)
    os.environ["RAGINT_OPS_ADMIN_TOKEN"] = "t1"
    os.environ["RAGINT_OPS_VIEW_TOKEN"] = "v1"
    app = create_app()
    c = app.test_client()

    assert c.get("/api/ops/devices").status_code == 401
    assert c.get("/api/ops/config?device_id=d1").status_code == 401
    assert c.post("/api/ops/config", json={"device_id": "d1", "config": {"a": 1}}).status_code == 401

    # view token allows reads only
    assert c.get("/api/ops/devices", headers={"X-Ops-Token": "v1"}).status_code == 200
    assert c.get("/api/ops/config?device_id=d1", headers={"X-Ops-Token": "v1"}).status_code == 200
    assert c.post("/api/ops/config", headers={"X-Ops-Token": "v1"}, json={"device_id": "d1", "config": {"a": 1}}).status_code == 401

    r = c.get("/api/ops/devices", headers={"X-Ops-Token": "t1"})
    assert r.status_code == 200
    assert r.get_json()["ok"] is True


def test_ops_device_register_and_token_auth(tmp_path):
    os.environ["RAGINT_OPS_DB_PATH"] = str(tmp_path / "ops.db")
    os.environ.pop("RAGINT_OPS_TOKEN", None)
    os.environ.pop("RAGINT_OPS_ADMIN_TOKEN", None)
    os.environ.pop("RAGINT_OPS_VIEW_TOKEN", None)
    os.environ["RAGINT_DEVICE_SHARED_SECRET"] = "s1"
    os.environ["RAGINT_DEVICE_AUTH_REQUIRED"] = "1"

    app = create_app()
    c = app.test_client()

    # heartbeat requires device token when auth is required
    assert c.post("/api/ops/heartbeat", json={"device_id": "d1"}).status_code == 401

    r0 = c.post("/api/ops/register_device", json={"device_id": "d1", "name": "robot1", "model": "m1"}, headers={"X-Device-Shared-Secret": "s1"})
    assert r0.status_code == 200
    tok = str(r0.get_json()["device_token"] or "")
    assert tok

    r1 = c.post("/api/ops/heartbeat", json={"device_id": "d1", "version": "v1"}, headers={"X-Device-Token": tok})
    assert r1.status_code == 200

    # device can read its config with device token
    r2 = c.get("/api/ops/config?device_id=d1", headers={"X-Device-Token": tok})
    assert r2.status_code == 200
    assert r2.get_json()["device_id"] == "d1"


def test_ops_console_page_served(tmp_path):
    os.environ["RAGINT_OPS_DB_PATH"] = str(tmp_path / "ops.db")
    os.environ.pop("RAGINT_OPS_TOKEN", None)
    app = create_app()
    c = app.test_client()
    r = c.get("/ops")
    assert r.status_code == 200
    assert "RagInt Ops Console" in (r.get_data(as_text=True) or "")
