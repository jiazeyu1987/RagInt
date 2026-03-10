from __future__ import annotations

import threading

import backend.services.request_registry as request_registry_module
from backend.services.request_registry import RequestRegistry


def test_register_cancel_previous_and_clear_active():
    registry = RequestRegistry()

    ev1 = registry.register(client_id="c1", request_id="r1", kind="ask", cancel_previous=True)
    assert not ev1.is_set()
    assert registry.is_cancelled("r1") is False

    ev2 = registry.register(
        client_id="c1",
        request_id="r2",
        kind="ask",
        cancel_previous=True,
        cancel_reason="replaced",
    )
    assert not ev2.is_set()
    assert registry.is_cancelled("r1") is True
    info1 = registry.get_info("r1")
    assert info1 is not None
    assert info1["cancel_reason"] == "replaced"

    registry.register(client_id="c1", request_id="r3", kind="ask", cancel_previous=False)
    assert registry.is_cancelled("r2") is False

    registry.clear_active(client_id="c1", kind="ask", request_id="r3")
    assert registry.cancel_active(client_id="c1", kind="ask", reason="manual") is None


def test_cancel_cancel_active_and_get_cancel_event():
    registry = RequestRegistry()

    assert registry.cancel("r_manual", reason="manual") is True
    assert registry.is_cancelled("r_manual") is True
    ev = registry.get_cancel_event("r_manual")
    assert ev.is_set() is True
    info = registry.get_info("r_manual")
    assert info is not None
    assert info["cancel_reason"] == "manual"
    assert info["kind"] == "unknown"

    registry.register(client_id="c2", request_id="r_tts", kind="tts")
    canceled_id = registry.cancel_active(client_id="c2", kind="tts", reason="interrupt")
    assert canceled_id == "r_tts"
    assert registry.is_cancelled("r_tts") is True
    info_tts = registry.get_info("r_tts")
    assert info_tts is not None
    assert info_tts["cancel_reason"] == "interrupt"


def test_rate_allow_respects_window_and_limit(monkeypatch):
    now = {"t": 100.0}

    def _fake_perf_counter():
        return now["t"]

    monkeypatch.setattr(request_registry_module.time, "perf_counter", _fake_perf_counter)
    registry = RequestRegistry()

    assert registry.rate_allow("client_a", "ask", limit=2, window_s=1.0) is True
    assert registry.rate_allow("client_a", "ask", limit=2, window_s=1.0) is True
    assert registry.rate_allow("client_a", "ask", limit=2, window_s=1.0) is False

    now["t"] += 1.1
    assert registry.rate_allow("client_a", "ask", limit=2, window_s=1.0) is True


def test_prune_removes_expired_infos_and_active_mapping(monkeypatch):
    now = {"t": 50.0}

    def _fake_perf_counter():
        return now["t"]

    monkeypatch.setattr(request_registry_module.time, "perf_counter", _fake_perf_counter)
    registry = RequestRegistry()

    registry.register(client_id="c3", request_id="r_old", kind="ask")
    registry.cancel("r_old", reason="done")
    assert registry.cancel_active(client_id="c3", kind="ask") == "r_old"

    now["t"] = 500.0
    registry._prune(now["t"], ttl_s=10.0, max_items=1)  # noqa: SLF001 - verify internal cleanup behavior.

    assert registry.get_info("r_old") is None
    assert registry.cancel_active(client_id="c3", kind="ask") is None


def test_concurrent_register_same_key_active_can_be_cancelled():
    registry = RequestRegistry()
    client_id = "cc"
    kind = "ask"
    rids = [f"r_{i}" for i in range(8)]
    start_barrier = threading.Barrier(len(rids))
    done = []
    errs: list[Exception] = []

    def _worker(rid: str):
        try:
            start_barrier.wait(timeout=2.0)
            ev = registry.register(client_id=client_id, request_id=rid, kind=kind, cancel_previous=True)
            done.append((rid, ev))
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    threads = [threading.Thread(target=_worker, args=(rid,), daemon=True) for rid in rids]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=3.0)

    assert errs == []
    assert len(done) == len(rids)

    active = registry.cancel_active(client_id=client_id, kind=kind, reason="race_cancel")
    assert active in set(rids)
    assert registry.is_cancelled(str(active)) is True
    info = registry.get_info(str(active))
    assert info is not None
    assert info["cancel_reason"] == "race_cancel"
    active2 = registry.cancel_active(client_id=client_id, kind=kind, reason="again")
    assert active2 == active
    info2 = registry.get_info(str(active2))
    assert info2 is not None
    assert info2["cancel_reason"] == "again"


def test_concurrent_cancel_same_request_sets_event_and_info():
    registry = RequestRegistry()
    registry.register(client_id="c1", request_id="r_shared", kind="ask")

    reasons = [f"reason_{i}" for i in range(10)]
    start_barrier = threading.Barrier(len(reasons))
    results: list[bool] = []
    errs: list[Exception] = []

    def _worker(reason: str):
        try:
            start_barrier.wait(timeout=2.0)
            results.append(registry.cancel("r_shared", reason=reason))
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    threads = [threading.Thread(target=_worker, args=(reason,), daemon=True) for reason in reasons]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=3.0)

    assert errs == []
    assert results and all(results)
    ev = registry.get_cancel_event("r_shared")
    assert ev.is_set() is True
    info = registry.get_info("r_shared")
    assert info is not None
    assert info["canceled_at"] is not None
    assert info["cancel_reason"] in set(reasons)


def test_concurrent_rate_allow_keeps_global_limit(monkeypatch):
    fixed = {"t": 123.0}

    def _fake_perf_counter():
        return fixed["t"]

    monkeypatch.setattr(request_registry_module.time, "perf_counter", _fake_perf_counter)
    registry = RequestRegistry()

    total = 20
    limit = 5
    start_barrier = threading.Barrier(total)
    results: list[bool] = []
    errs: list[Exception] = []

    def _worker():
        try:
            start_barrier.wait(timeout=2.0)
            results.append(registry.rate_allow("rate_c", "ask", limit=limit, window_s=1.0))
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    threads = [threading.Thread(target=_worker, daemon=True) for _ in range(total)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=3.0)

    assert errs == []
    assert len(results) == total
    assert sum(1 for x in results if x) == limit
    assert sum(1 for x in results if not x) == total - limit
