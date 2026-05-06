from __future__ import annotations

import pytest

from backend.infra import event_store as event_store_module
from backend.infra.event_store import RedisEventStore


class _Pipeline:
    def __init__(self, client):
        self.client = client

    def lpush(self, key, value):  # noqa: ANN001
        self.client.lpush_calls.append((key, value))
        return self

    def ltrim(self, key, start, end):  # noqa: ANN001
        self.client.ltrim_calls.append((key, start, end))
        return self

    def expire(self, key, ttl):  # noqa: ANN001
        self.client.expire_calls.append((key, ttl))
        return self

    def execute(self):
        if self.client.execute_error is not None:
            raise self.client.execute_error
        return True


class _RedisClient:
    def __init__(self):
        self.values: dict[str, list[str]] = {}
        self.lrange_error: Exception | None = None
        self.execute_error: Exception | None = None
        self.lpush_calls: list[tuple] = []
        self.ltrim_calls: list[tuple] = []
        self.expire_calls: list[tuple] = []

    def pipeline(self):
        return _Pipeline(self)

    def lrange(self, key, start, end):  # noqa: ANN001
        if self.lrange_error is not None:
            raise self.lrange_error
        return list(self.values.get(str(key), []))[int(start) : int(end) + 1]


@pytest.fixture()
def redis_store(monkeypatch):
    client = _RedisClient()
    monkeypatch.setattr(event_store_module, "create_redis_client", lambda: client)
    store = RedisEventStore(per_request_max=50, global_max=200, ttl_s=60.0)
    return store, client


def test_redis_list_events_returns_empty_for_existing_empty_list(redis_store):
    store, _client = redis_store

    assert store.list_events(request_id="r1") == []
    assert store.list_recent() == []
    assert store.last_error(request_id="r1") is None


def test_redis_emit_exposes_write_failure(redis_store):
    store, client = redis_store
    client.execute_error = RuntimeError("redis_write_failed")

    with pytest.raises(RuntimeError, match="redis_write_failed"):
        store.emit(request_id="r1", kind="test", name="event")


def test_redis_list_events_exposes_read_failure(redis_store):
    store, client = redis_store
    client.lrange_error = RuntimeError("redis_read_failed")

    with pytest.raises(RuntimeError, match="redis_read_failed"):
        store.list_events(request_id="r1")


def test_redis_list_events_exposes_corrupt_json(redis_store):
    store, client = redis_store
    client.values["ragint:events:rid:r1"] = ["not-json"]

    with pytest.raises(ValueError):
        store.list_events(request_id="r1")


def test_redis_list_events_exposes_schema_error(redis_store):
    store, client = redis_store
    client.values["ragint:events:rid:r1"] = ['{"ts_ms": 1, "request_id": "r1"}']

    with pytest.raises(ValueError, match="missing required fields"):
        store.list_events(request_id="r1")
