from __future__ import annotations

import os
from dataclasses import dataclass

from flask import Flask

from backend.api.ops import create_blueprint


@dataclass
class _Device:
    device_id: str
    name: str
    model: str
    version: str
    last_seen_at_ms: int
    meta: dict


@dataclass
class _Config:
    config_version: int
    config: dict
    updated_at_ms: int


@dataclass
class _Audit:
    id: int
    ts_ms: int
    actor_kind: str
    actor_id: str
    action: str
    target_kind: str
    target_id: str
    payload: dict


class _OpsStore:
    def __init__(self):
        self.devices: dict[str, _Device] = {}
        self.configs: dict[str, _Config] = {}
        self.tokens: dict[str, str] = {}
        self.audit_events: list[_Audit] = []
        self.cfg_ver: int = 0

    def list_devices(self, limit=100):
        return list(self.devices.values())[:limit]

    def heartbeat(self, *, device_id, name=None, model=None, version=None, meta=None):
        self.devices[device_id] = _Device(
            device_id=device_id,
            name=name or "",
            model=model or "",
            version=version or "",
            last_seen_at_ms=1,
            meta=dict(meta or {}),
        )
        return True

    def get_config(self, *, device_id):
        return self.configs.get(device_id)

    def set_config(self, *, device_id, config):
        self.cfg_ver += 1
        saved = _Config(config_version=self.cfg_ver, config=dict(config or {}), updated_at_ms=1)
        self.configs[device_id] = saved
        return saved

    def issue_device_token(self, *, device_id):
        tok = f"t_{device_id}"
        self.tokens[device_id] = tok
        return tok

    def verify_device_token(self, *, device_id, token):
        return self.tokens.get(device_id) == token

    def audit(self, **kwargs):
        self.audit_events.append(
            _Audit(
                id=len(self.audit_events) + 1,
                ts_ms=1,
                actor_kind=str(kwargs.get("actor_kind") or ""),
                actor_id=str(kwargs.get("actor_id") or ""),
                action=str(kwargs.get("action") or ""),
                target_kind=str(kwargs.get("target_kind") or ""),
                target_id=str(kwargs.get("target_id") or ""),
                payload=dict(kwargs.get("payload") or {}),
            )
        )

    def list_audit(self, limit=200, target_kind=None, target_id=None):
        events = list(self.audit_events)
        if target_kind:
            events = [e for e in events if e.target_kind == target_kind]
        if target_id:
            events = [e for e in events if e.target_id == target_id]
        return events[:limit]


class _EventStore:
    def emit(self, **kwargs):  # noqa: ANN003
        return None


class _Deps:
    def __init__(self):
        self.ops_store = _OpsStore()
        self.event_store = _EventStore()


def _app():
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps()))
    return app


def test_ops_blueprint_console_and_device_flow():
    os.environ.pop("RAGINT_OPS_TOKEN", None)
    os.environ.pop("RAGINT_OPS_ADMIN_TOKEN", None)
    os.environ.pop("RAGINT_OPS_VIEW_TOKEN", None)
    os.environ.pop("RAGINT_DEVICE_AUTH_REQUIRED", None)
    os.environ.pop("RAGINT_DEVICE_SHARED_SECRET", None)

    c = _app().test_client()
    assert c.get("/ops").status_code == 200
    assert c.post("/api/ops/heartbeat", json={"device_id": "d1", "name": "n1"}).status_code == 200
    assert c.get("/api/ops/devices").status_code == 200
    assert c.post("/api/ops/config", json={"device_id": "d1", "config": {"k": "v"}}).status_code == 200
    got = c.get("/api/ops/config?device_id=d1").get_json()
    assert got["config"]["k"] == "v"


def test_ops_blueprint_token_guard():
    os.environ["RAGINT_OPS_ADMIN_TOKEN"] = "a1"
    os.environ["RAGINT_OPS_VIEW_TOKEN"] = "v1"
    os.environ.pop("RAGINT_DEVICE_AUTH_REQUIRED", None)

    c = _app().test_client()
    assert c.get("/api/ops/devices").status_code == 401
    assert c.get("/api/ops/devices", headers={"X-Ops-Token": "v1"}).status_code == 200
    assert c.post("/api/ops/config", headers={"X-Ops-Token": "v1"}, json={"device_id": "d1", "config": {"a": 1}}).status_code == 401
    assert c.post("/api/ops/config", headers={"X-Ops-Token": "a1"}, json={"device_id": "d1", "config": {"a": 1}}).status_code == 200
