from __future__ import annotations

import logging
import sqlite3

import pytest

from backend.services.breakpoint_store import BreakpointStore, BreakpointStoreError


def test_breakpoint_store_upsert_get_clear(tmp_path):
    store = BreakpointStore(tmp_path / "bp.db", logger=logging.getLogger("test"))

    assert store.get(kind="tour", client_id="cid1") is None
    rec = store.upsert(kind="tour", client_id="cid1", state={"stopIndex": 2, "mode": "running"}, now_ms=123)
    assert rec is not None
    assert rec.kind == "tour"
    assert rec.client_id == "cid1"
    assert rec.state["stopIndex"] == 2

    rec2 = store.get(kind="tour", client_id="cid1")
    assert rec2 is not None
    assert rec2.state["mode"] == "running"

    assert store.clear(kind="tour", client_id="cid1") is True
    assert store.get(kind="tour", client_id="cid1") is None


def test_breakpoint_store_raises_on_corrupt_state_json(tmp_path):
    db_path = tmp_path / "bp.db"
    store = BreakpointStore(db_path, logger=logging.getLogger("test"))

    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            INSERT INTO breakpoints (kind, client_id, state_json, created_at_ms, updated_at_ms)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("tour", "cid_bad", "{not-json", 1, 1),
        )
        conn.commit()

    with pytest.raises(BreakpointStoreError, match="invalid_state_json"):
        store.get(kind="tour", client_id="cid_bad")
