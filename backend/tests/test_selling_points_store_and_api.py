from __future__ import annotations

import os

from backend.app import create_app
from backend.services.selling_points_store import SellingPointsStore


def test_selling_points_store_topn(tmp_path):
    store = SellingPointsStore(tmp_path / "sp.db")
    assert store.upsert(stop_name="A", text="p1", weight=1.0, tags=["t"])
    assert store.upsert(stop_name="A", text="p2", weight=3.0)
    assert store.upsert(stop_name="A", text="p3", weight=2.0)
    pts = store.list(stop_name="A", limit=10)
    top2 = store.pick_topn(points=pts, n=2)
    assert [p.text for p in top2] == ["p2", "p3"]


def test_selling_points_levels_and_workflow(tmp_path):
    store = SellingPointsStore(tmp_path / "sp.db")
    assert store.upsert(stop_name="A", text="pub", weight=1.0, level="public", status="published")
    assert store.upsert(stop_name="A", text="int_draft", weight=9.0, level="internal", status="draft")

    # default list() => published only
    pts = store.list(stop_name="A", limit=10)
    assert [p.text for p in pts] == ["pub"]

    # include all statuses
    pts_all = store.list(stop_name="A", limit=10, status=None)
    assert {p.text for p in pts_all} == {"pub", "int_draft"}

    # max_level filter
    pts_pub_only = store.list(stop_name="A", limit=10, status=None, max_level="public")
    assert {p.text for p in pts_pub_only} == {"pub"}

    # workflow transitions
    assert store.transition_status(stop_name="A", text="int_draft", action="submit") == "review"
    assert store.transition_status(stop_name="A", text="int_draft", action="approve") == "published"
    pts_pub = store.list(stop_name="A", limit=10)
    assert {p.text for p in pts_pub} == {"pub", "int_draft"}


def test_selling_points_api_roundtrip(tmp_path):
    os.environ["RAGINT_VERSION"] = "0.0.0-test"
    os.environ["RAGINT_SELLING_POINTS_DB_PATH"] = str(tmp_path / "selling_points.db")
    app = create_app()
    c = app.test_client()

    r1 = c.post("/api/selling_points", json={"stop_name": "Stop1", "text": "卖点A", "weight": 5})
    assert r1.status_code == 200
    assert r1.get_json()["ok"] is True

    r2 = c.get("/api/selling_points?stop_name=Stop1")
    assert r2.status_code == 200
    items = r2.get_json()["items"]
    assert any(x["text"] == "卖点A" for x in items)

    r3 = c.get("/api/selling_points/topn?stop_name=Stop1&n=1")
    assert r3.status_code == 200
    p3 = r3.get_json()
    assert p3["n"] == 1
    assert len(p3["items"]) == 1


def test_selling_points_api_workflow_transitions(tmp_path):
    os.environ["RAGINT_SELLING_POINTS_DB_PATH"] = str(tmp_path / "selling_points.db")
    app = create_app()
    c = app.test_client()

    r1 = c.post("/api/selling_points", json={"stop_name": "Stop1", "text": "内部草稿", "weight": 1, "level": "internal", "status": "draft"})
    assert r1.status_code == 200

    r2 = c.post("/api/selling_points/workflow", json={"stop_name": "Stop1", "text": "内部草稿", "action": "submit"})
    assert r2.status_code == 200
    assert r2.get_json()["status"] == "review"

    r3 = c.post("/api/selling_points/workflow", json={"stop_name": "Stop1", "text": "内部草稿", "action": "approve"})
    assert r3.status_code == 200
    assert r3.get_json()["status"] == "published"

    r4 = c.get("/api/selling_points?stop_name=Stop1")
    assert r4.status_code == 200
    assert any(x["text"] == "内部草稿" and x["status"] == "published" for x in (r4.get_json().get("items") or []))
