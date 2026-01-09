from __future__ import annotations

import logging

from backend.services.tour_control_store import TourControlStore


def test_tour_control_effective_status_waiting_paused_queued_playing(tmp_path):
    store = TourControlStore(tmp_path / "tourctl.db", logger=logging.getLogger("test"))
    cid = "c1"

    assert store.get_state(client_id=cid) is None
    assert store.get_effective_status(client_id=cid) == "waiting"
    assert store.get_queue_depth(client_id=cid) == 0

    cmd1 = store.add_command(client_id=cid, action="pause")
    assert cmd1 > 0
    assert store.get_effective_status(client_id=cid) == "paused"
    assert store.get_queue_depth(client_id=cid) == 1

    assert store.consume(client_id=cid, command_id=cmd1) is True
    assert store.get_queue_depth(client_id=cid) == 0
    assert store.get_effective_status(client_id=cid) == "paused"

    cmd2 = store.add_command(client_id=cid, action="resume")
    assert cmd2 > 0
    # unconsumed resume => queued, but still not paused
    assert store.get_effective_status(client_id=cid) == "queued"
    assert store.get_state(client_id=cid).paused is False

    assert store.consume(client_id=cid, command_id=cmd2) is True
    assert store.get_effective_status(client_id=cid) == "playing"

    cmd3 = store.add_command(client_id=cid, action="reset")
    assert cmd3 > 0
    assert store.get_effective_status(client_id=cid) == "queued"
    assert store.consume(client_id=cid, command_id=cmd3) is True
    assert store.get_effective_status(client_id=cid) == "waiting"

