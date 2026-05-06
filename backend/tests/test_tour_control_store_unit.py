from __future__ import annotations

import logging
import shutil
import sqlite3
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
    with pytest.raises(ValueError, match="invalid_command_id"):
        store.consume(client_id="cid_1", command_id=0)
    with pytest.raises(ValueError, match="invalid_command_id"):
        store.consume(client_id="cid_1", command_id=-1)
    with pytest.raises(ValueError, match="invalid_command_id"):
        store.consume(client_id="cid_1", command_id="bad")


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

    with pytest.raises(ValueError, match="invalid_speed"):
        store.add_command(client_id=cid, action="speed", payload={"speed": "bad"})


def test_list_commands_since_limit_and_payload_validation(work_dir: Path):
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

    with pytest.raises(ValueError, match="invalid tour_control_commands.payload_json"):
        store.list_commands(client_id=cid, since_id=0, limit=200)


def test_list_commands_fails_fast_on_unexpected_payload_shape(work_dir: Path):
    store = _store(work_dir)
    cid = "cid_payload_shape"

    conn = store._connect()  # noqa: SLF001 - unit test seeds unexpected persisted JSON shape.
    try:
        conn.execute(
            """
            INSERT INTO tour_control_commands (client_id, action, payload_json, created_at_ms, consumed_at_ms)
            VALUES (?, ?, ?, ?, NULL)
            """,
            (cid, "jump", "[]", 99999),
        )
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError, match="invalid tour_control_commands.payload_json"):
        store.list_commands(client_id=cid, since_id=0, limit=200)


def test_list_commands_fails_fast_on_invalid_created_timestamp(work_dir: Path):
    store = _store(work_dir)
    cid = "cid_bad_created_at"

    conn = store._connect()  # noqa: SLF001 - unit test seeds corrupt persisted timestamp.
    try:
        conn.execute(
            """
            INSERT INTO tour_control_commands (client_id, action, payload_json, created_at_ms, consumed_at_ms)
            VALUES (?, ?, ?, ?, NULL)
            """,
            (cid, "jump", "{}", "bad-ts"),
        )
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError, match="invalid tour_control_commands.created_at_ms"):
        store.list_commands(client_id=cid, since_id=0, limit=50)


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


def test_list_commands_rejects_invalid_since_id_and_limit(work_dir: Path):
    store = _store(work_dir)

    with pytest.raises(ValueError, match="invalid_since_id"):
        store.list_commands(client_id="cid_args", since_id="bad", limit=50)

    with pytest.raises(ValueError, match="invalid_limit"):
        store.list_commands(client_id="cid_args", since_id=0, limit="bad")


def test_get_state_fails_fast_on_corrupt_state_values(work_dir: Path):
    store = _store(work_dir)
    cid = "cid_bad_state"
    assert store.add_command(client_id=cid, action="pause") > 0

    conn = store._connect()  # noqa: SLF001 - unit test seeds corrupt persisted state.
    try:
        conn.execute(
            "UPDATE tour_control_state SET paused=?, speed=?, updated_at_ms=? WHERE client_id=?",
            ("bad-paused", "bad-speed", "bad-ts", cid),
        )
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError, match="invalid tour_control_state.paused"):
        store.get_state(client_id=cid)


def test_effective_status_unknown_status_fails_fast(work_dir: Path):
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

    with pytest.raises(ValueError, match="invalid_tour_control_status:mystery"):
        store.get_effective_status(client_id=cid)

    conn2 = store._connect()  # noqa: SLF001
    try:
        conn2.execute("UPDATE tour_control_state SET status='mystery', paused=1 WHERE client_id=?", (cid,))
        conn2.commit()
    finally:
        conn2.close()

    assert store.get_effective_status(client_id=cid) == "paused"


def test_existing_state_table_without_status_is_migrated(work_dir: Path):
    db_path = work_dir / "tourctl.db"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            """
            CREATE TABLE tour_control_state (
                client_id TEXT PRIMARY KEY,
                paused INTEGER NOT NULL DEFAULT 0,
                speed REAL NOT NULL DEFAULT 1.0,
                updated_at_ms INTEGER NOT NULL
            );
            """
        )
        conn.execute(
            """
            INSERT INTO tour_control_state (client_id, paused, speed, updated_at_ms)
            VALUES ('legacy_client', 0, 1.0, 123)
            """
        )
        conn.commit()
    finally:
        conn.close()

    store = TourControlStore(db_path, logger=logging.getLogger("test_tour_control_store"))

    state = store.get_state(client_id="legacy_client")
    assert state is not None
    assert state.status == "waiting"
    assert store.add_command(client_id="new_client", action="pause") > 0
