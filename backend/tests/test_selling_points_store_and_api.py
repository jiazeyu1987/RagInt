from __future__ import annotations

import os
import sqlite3

import pytest

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


@pytest.mark.parametrize("tags_json", ["not-json", '{"tag":"bad-shape"}'])
def test_selling_points_store_fails_fast_on_invalid_tags_json(tmp_path, tags_json):
    store = SellingPointsStore(tmp_path / "sp.db")
    assert store.upsert(stop_name="A", text="bad-tags", weight=1.0, tags=[])

    conn = store._connect()  # noqa: SLF001 - unit test seeds corrupt persisted JSON.
    try:
        conn.execute(
            "UPDATE selling_points SET tags_json = ? WHERE stop_name = ? AND text = ?",
            (tags_json, "A", "bad-tags"),
        )
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError, match="invalid selling_points.tags_json"):
        store.list(stop_name="A", limit=10)


def test_selling_points_store_does_not_swallow_schema_migration_failure(tmp_path):
    store = SellingPointsStore(tmp_path / "sp.db")

    class BrokenConn:
        def execute(self, *args, **kwargs):
            raise sqlite3.OperationalError("database is locked")

    with pytest.raises(sqlite3.OperationalError, match="database is locked"):
        store._ensure_column(  # noqa: SLF001 - regression test for fail-fast schema migration.
            conn=BrokenConn(),
            table="selling_points",
            column="status",
            ddl='status TEXT NOT NULL DEFAULT "published"',
        )


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"weight": "heavy"}, "selling_points_weight_invalid"),
        ({"level": "secret"}, "selling_points_level_invalid"),
        ({"status": "live"}, "selling_points_status_invalid"),
    ],
)
def test_selling_points_store_rejects_invalid_explicit_fields(tmp_path, kwargs, message):
    store = SellingPointsStore(tmp_path / "sp.db")

    with pytest.raises(ValueError, match=message):
        store.upsert(stop_name="A", text="bad-field", **kwargs)


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


def test_selling_points_api_does_not_return_ok_for_corrupt_tags_json(tmp_path):
    os.environ["RAGINT_SELLING_POINTS_DB_PATH"] = str(tmp_path / "selling_points.db")
    app = create_app()
    c = app.test_client()

    r1 = c.post("/api/selling_points", json={"stop_name": "Stop1", "text": "bad tags", "weight": 5})
    assert r1.status_code == 200

    store = app.config["deps"].selling_points_store
    conn = store._connect()  # noqa: SLF001 - integration test seeds corrupt persisted JSON.
    try:
        conn.execute(
            "UPDATE selling_points SET tags_json = ? WHERE stop_name = ? AND text = ?",
            ("not-json", "Stop1", "bad tags"),
        )
        conn.commit()
    finally:
        conn.close()

    r2 = c.get("/api/selling_points?stop_name=Stop1")
    assert r2.status_code == 500
    assert r2.get_json()["error"] == "selling_points_read_failed"


@pytest.mark.parametrize(
    ("payload", "error"),
    [
        ({"stop_name": "Stop1", "text": "bad weight", "weight": "heavy"}, "selling_points_weight_invalid"),
        ({"stop_name": "Stop1", "text": "bad tags", "tags": "tag"}, "tags_list_required"),
        ({"stop_name": "Stop1", "text": "bad level", "level": "secret"}, "selling_points_level_invalid"),
        ({"stop_name": "Stop1", "text": "bad status", "status": "live"}, "selling_points_status_invalid"),
    ],
)
def test_selling_points_api_rejects_invalid_explicit_upsert_fields(tmp_path, payload, error):
    os.environ["RAGINT_SELLING_POINTS_DB_PATH"] = str(tmp_path / "selling_points.db")
    app = create_app()
    c = app.test_client()

    r = c.post("/api/selling_points", json=payload)

    assert r.status_code == 400
    assert r.get_json()["error"] == error


@pytest.mark.parametrize(
    ("path", "field", "error"),
    [
        ("/api/selling_points?stop_name=Stop1&limit=many", "limit", "invalid_query_parameter"),
        ("/api/selling_points?stop_name=Stop1&status=live", "status", "invalid_query_parameter"),
        ("/api/selling_points?stop_name=Stop1&max_level=secret", "max_level", "invalid_query_parameter"),
        ("/api/selling_points/topn?stop_name=Stop1&n=many", "n", "invalid_query_parameter"),
        ("/api/selling_points/topn?stop_name=Stop1&max_level=secret", "max_level", "invalid_query_parameter"),
        ("/api/selling_points/topn?stop_name=Stop1&duration_s=soon", None, "duration_s_invalid"),
    ],
)
def test_selling_points_api_rejects_invalid_explicit_query_fields(tmp_path, path, field, error):
    os.environ["RAGINT_SELLING_POINTS_DB_PATH"] = str(tmp_path / "selling_points.db")
    app = create_app()
    c = app.test_client()

    r = c.get(path)

    assert r.status_code == 400
    body = r.get_json()
    assert body["error"] == error
    if field is not None:
        assert body["field"] == field


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
