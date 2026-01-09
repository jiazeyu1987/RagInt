from __future__ import annotations

import logging

from backend.services.breakpoint_store import BreakpointStore


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

