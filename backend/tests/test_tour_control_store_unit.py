from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path

import pytest

from backend.services.tour_control_store import TourControlStore


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"tour_control_store_test_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _store(work_dir: Path):
    return TourControlStore(work_dir / "tourctl.db", logger=logging.getLogger("test_tour_control_store"))


def test_add_command_invalid_inputs_and_consume_invalid_id(work_dir: Path):
    store = _store(work_dir)

    assert store.add_command(client_id="", action="pause") == 0
    assert store.add_command(client_id="cid_1", action="") == 0
    assert store.consume(client_id="", command_id=1) is False
    assert store.consume(client_id="cid_1", command_id=0) is False
    assert store.consume(client_id="cid_1", command_id=-1) is False


def test_speed_command_clamps_and_state_updates(work_dir: Path):
    store = _store(work_dir)
    cid = "cid_speed"

    id1 = store.add_command(client_id=cid, action="speed", payload={"speed": 10})
    assert id1 > 0
    st1 = store.get_state(client_id=cid)
    assert st1 is not None
    assert abs(float(st1.speed) - 3.0) < 1e-9

    id2 = store.add_command(client_id=cid, action="speed", payload={"speed": 0.1})
    assert id2 > 0
    st2 = store.get_state(client_id=cid)
    assert st2 is not None
    assert abs(float(st2.speed) - 0.5) < 1e-9

    id3 = store.add_command(client_id=cid, action="speed", payload={"speed": "bad"})
    assert id3 > 0
    st3 = store.get_state(client_id=cid)
    assert st3 is not None
    assert abs(float(st3.speed) - 1.0) < 1e-9


def test_list_commands_since_limit_and_payload_fallback(work_dir: Path):
    store = _store(work_dir)
    cid = "cid_list"

    ids = []
    for i in range(5):
        cid_i = store.add_command(client_id=cid, action="next", payload={"idx": i})
        ids.append(int(cid_i))
    assert len(ids) == 5

    out1 = store.list_commands(client_id=cid, since_id=ids[1], limit=2)
    assert [c.id for c in out1] == ids[2:4]

    out2 = store.list_commands(client_id=cid, since_id=0, limit=-2)
    assert len(out2) == 1

    conn = store._connect()  # noqa: SLF001 - unit test seeds malformed payload row.
    try:
        conn.execute(
            """
            INSERT INTO tour_control_commands (client_id, action, payload_json, created_at_ms, consumed_at_ms)
            VALUES (?, ?, ?, ?, NULL)
            """,
            (cid, "jump", "not-json", 99999),
        )
        conn.commit()
    finally:
        conn.close()

    out3 = store.list_commands(client_id=cid, since_id=0, limit=200)
    malformed = [c for c in out3 if c.action == "jump" and c.created_at_ms == 99999]
    assert len(malformed) == 1
    assert malformed[0].payload == {}


def test_consume_idempotent_and_client_isolated(work_dir: Path):
    store = _store(work_dir)
    cid1 = "cid_1"
    cid2 = "cid_2"

    cmd1 = store.add_command(client_id=cid1, action="pause")
    cmd2 = store.add_command(client_id=cid2, action="pause")
    assert cmd1 > 0 and cmd2 > 0

    # Wrong client should never consume another client's command.
    assert store.consume(client_id=cid2, command_id=cmd1) is False
    assert store.consume(client_id=cid1, command_id=cmd2) is False

    # First consume succeeds, second consume is idempotent false.
    assert store.consume(client_id=cid1, command_id=cmd1) is True
    assert store.consume(client_id=cid1, command_id=cmd1) is False


def test_list_commands_limit_clamped_and_since_id_normalized(work_dir: Path):
    store = _store(work_dir)
    cid = "cid_many"

    ids: list[int] = []
    for i in range(260):
        ids.append(int(store.add_command(client_id=cid, action="next", payload={"idx": i})))
    assert len(ids) == 260

    # limit > 200 should be clamped to 200.
    out = store.list_commands(client_id=cid, since_id=0, limit=999)
    assert len(out) == 200
    assert out[0].id == ids[0]
    assert out[-1].id == ids[199]

    # negative since_id should be normalized to 0.
    out2 = store.list_commands(client_id=cid, since_id=-50, limit=5)
    assert [x.id for x in out2] == ids[:5]

    out3 = store.list_commands(client_id=cid, since_id=ids[-6], limit=100)
    assert [x.id for x in out3] == ids[-5:]


def test_effective_status_unknown_falls_back_to_waiting(work_dir: Path):
    store = _store(work_dir)
    cid = "cid_state"

    cmd = store.add_command(client_id=cid, action="pause")
    assert cmd > 0
    assert store.consume(client_id=cid, command_id=cmd) is True
    assert store.get_queue_depth(client_id=cid) == 0

    conn = store._connect()  # noqa: SLF001 - direct DB mutation for edge-case state.
    try:
        conn.execute("UPDATE tour_control_state SET status='mystery', paused=0 WHERE client_id=?", (cid,))
        conn.commit()
    finally:
        conn.close()

    assert store.get_effective_status(client_id=cid) == "waiting"

    conn2 = store._connect()  # noqa: SLF001
    try:
        conn2.execute("UPDATE tour_control_state SET status='mystery', paused=1 WHERE client_id=?", (cid,))
        conn2.commit()
    finally:
        conn2.close()

    assert store.get_effective_status(client_id=cid) == "paused"
