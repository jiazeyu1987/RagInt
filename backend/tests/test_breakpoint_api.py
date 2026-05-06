from __future__ import annotations

import os
from types import SimpleNamespace

from flask import Flask

from backend.api.breakpoint import create_blueprint
from backend.app import create_app
from backend.services.breakpoint_store import BreakpointStoreError


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


class FailingBreakpointStore:
    def get(self, *, kind, client_id):
        raise BreakpointStoreError("read_failed")

    def upsert(self, *, kind, client_id, state):
        raise BreakpointStoreError("save_failed")

    def clear(self, *, kind, client_id):
        raise BreakpointStoreError("delete_failed")


def make_breakpoint_api_client(store):
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(SimpleNamespace(breakpoint_store=store)))
    return app.test_client()


def test_breakpoint_get_reports_store_read_failure():
    c = make_breakpoint_api_client(FailingBreakpointStore())

    r = c.get("/api/breakpoint", headers={"X-Client-ID": "cid_test_2"})

    assert r.status_code == 500
    assert r.get_json() == {"ok": False, "error": "breakpoint_read_failed"}


def test_breakpoint_post_reports_store_save_failure():
    c = make_breakpoint_api_client(FailingBreakpointStore())

    r = c.post("/api/breakpoint", headers={"X-Client-ID": "cid_test_3"}, json={"state": {"stopIndex": 1}})

    assert r.status_code == 500
    assert r.get_json() == {"ok": False, "error": "breakpoint_save_failed"}


def test_breakpoint_delete_reports_store_delete_failure():
    c = make_breakpoint_api_client(FailingBreakpointStore())

    r = c.delete("/api/breakpoint", headers={"X-Client-ID": "cid_test_4"})

    assert r.status_code == 500
    assert r.get_json() == {"ok": False, "error": "breakpoint_delete_failed"}
