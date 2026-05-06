from __future__ import annotations

import pytest

from backend.infra import cancellation as cancellation_module
from backend.infra.cancellation import RedisRequestRegistry


class _RedisPipeline:
    def __init__(self, client):
        self.client = client
        self.result = []

    def incr(self, key, amount):  # noqa: ANN001
        current = int(self.client.values.get(str(key), "0") or "0") + int(amount)
        self.client.values[str(key)] = str(current)
        self.result.append(current)
        return self

    def expire(self, key, ttl):  # noqa: ANN001
        self.client.expire_calls.append((key, ttl))
        self.result.append(True)
        return self

    def set(self, key, value, ex=None):  # noqa: ANN001
        self.client.values[str(key)] = str(value)
        self.client.set_calls.append((key, value, ex))
        return self

    def hset(self, key, mapping):  # noqa: ANN001
        self.client.hashes.setdefault(str(key), {}).update(dict(mapping))
        self.client.hset_calls.append((key, dict(mapping)))
        return self

    def execute(self):
        if self.client.execute_error is not None:
            raise self.client.execute_error
        return list(self.result)


class _RedisClient:
    def __init__(self):
        self.values: dict[str, str] = {}
        self.hashes: dict[str, dict[str, str]] = {}
        self.get_error: Exception | None = None
        self.hgetall_error: Exception | None = None
        self.delete_error: Exception | None = None
        self.execute_error: Exception | None = None
        self.set_calls: list[tuple] = []
        self.hset_calls: list[tuple] = []
        self.expire_calls: list[tuple] = []
        self.delete_calls: list[str] = []

    def pipeline(self):
        return _RedisPipeline(self)

    def get(self, key):  # noqa: ANN001
        if self.get_error is not None:
            raise self.get_error
        return self.values.get(str(key))

    def hgetall(self, key):  # noqa: ANN001
        if self.hgetall_error is not None:
            raise self.hgetall_error
        return dict(self.hashes.get(str(key), {}))

    def delete(self, key):  # noqa: ANN001
        if self.delete_error is not None:
            raise self.delete_error
        self.delete_calls.append(str(key))
        self.values.pop(str(key), None)
        return 1


@pytest.fixture()
def redis_registry(monkeypatch):
    client = _RedisClient()
    monkeypatch.setattr(cancellation_module, "create_redis_client", lambda: client)
    registry = RedisRequestRegistry()
    return registry, client


def test_redis_cancel_status_returns_false_when_key_is_absent(redis_registry):
    registry, _client = redis_registry

    assert registry.is_cancelled("r1") is False
    assert registry.get_cancel_event("r1").is_set() is False


def test_redis_cancel_status_exposes_read_failure(redis_registry):
    registry, client = redis_registry
    client.get_error = RuntimeError("redis_read_failed")

    with pytest.raises(RuntimeError, match="redis_read_failed"):
        registry.is_cancelled("r1")

    with pytest.raises(RuntimeError, match="redis_read_failed"):
        registry.get_cancel_event("r1").is_set()


def test_redis_cancel_exposes_write_failure(redis_registry):
    registry, client = redis_registry
    client.execute_error = RuntimeError("redis_write_failed")

    with pytest.raises(RuntimeError, match="redis_write_failed"):
        registry.cancel("r1", reason="manual")


def test_redis_register_exposes_write_failure(redis_registry):
    registry, client = redis_registry
    client.execute_error = RuntimeError("redis_write_failed")

    with pytest.raises(RuntimeError, match="redis_write_failed"):
        registry.register(client_id="c1", request_id="r1", kind="ask")


def test_redis_cancel_active_keeps_missing_active_as_noop(redis_registry):
    registry, _client = redis_registry

    assert registry.cancel_active(client_id="c1", kind="ask") is None


def test_redis_get_info_exposes_schema_error(redis_registry):
    registry, client = redis_registry
    client.hashes["ragint:info:r1"] = {
        "request_id": "r1",
        "client_id": "c1",
        "kind": "ask",
        "created_at": "not-a-number",
        "canceled_at": "",
        "cancel_reason": "",
    }

    with pytest.raises(ValueError, match="created_at"):
        registry.get_info("r1")
