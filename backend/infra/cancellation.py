from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from backend.services.request_registry import RequestRegistry
from backend.infra.redis_client import create_redis_client


class CancelledError(RuntimeError):
    def __init__(self, request_id: str, reason: str | None = None):
        super().__init__(reason or "cancelled")
        self.request_id = request_id
        self.reason = reason


@dataclass(frozen=True)
class CancelToken:
    request_id: str
    event: "CancelEvent"
    reason: str | None = None

    def checkpoint(self) -> None:
        if self.event.is_set():
            raise CancelledError(self.request_id, self.reason)


class CancellationRegistry:
    """
    Thin wrapper around `services.request_registry.RequestRegistry`.

    Purpose:
    - Provide a stable "infra" API for cancellation/interrupts.
    - Keep app/services decoupled from the underlying implementation.
    """

    def __init__(self):
        backend = str(os.environ.get("RAGINT_STATE_BACKEND") or "").strip().lower()
        if backend == "redis":
            self._registry = RedisRequestRegistry()
        else:
            self._registry = RequestRegistry()

    def rate_allow(self, client_id: str, kind: str, *, limit: int, window_s: float) -> bool:
        return self._registry.rate_allow(client_id, kind, limit=limit, window_s=window_s)

    def register(
        self,
        *,
        client_id: str,
        request_id: str,
        kind: str,
        cancel_previous: bool = True,
        cancel_reason: str = "replaced_by_new",
    ) -> "CancelEvent":
        return self._registry.register(
            client_id=client_id,
            request_id=request_id,
            kind=kind,
            cancel_previous=cancel_previous,
            cancel_reason=cancel_reason,
        )

    def register_token(
        self,
        *,
        client_id: str,
        request_id: str,
        kind: str,
        cancel_previous: bool = True,
        cancel_reason: str = "replaced_by_new",
    ) -> CancelToken:
        ev = self.register(
            client_id=client_id,
            request_id=request_id,
            kind=kind,
            cancel_previous=cancel_previous,
            cancel_reason=cancel_reason,
        )
        return CancelToken(request_id=request_id, event=ev, reason=cancel_reason)

    def clear_active(self, *, client_id: str, kind: str, request_id: str) -> None:
        self._registry.clear_active(client_id=client_id, kind=kind, request_id=request_id)

    def cancel(self, request_id: str, *, reason: str = "cancelled") -> bool:
        return self._registry.cancel(request_id, reason=reason)

    def cancel_active(self, *, client_id: str, kind: str, reason: str = "cancelled") -> str | None:
        return self._registry.cancel_active(client_id=client_id, kind=kind, reason=reason)

    def get_cancel_event(self, request_id: str) -> "CancelEvent":
        return self._registry.get_cancel_event(request_id)

    def is_cancelled(self, request_id: str) -> bool:
        return self._registry.is_cancelled(request_id)

    def get_info(self, request_id: str) -> dict | None:
        return self._registry.get_info(request_id)


class _RedisCancelEvent:
    def __init__(self, client, *, key: str):
        self._client = client
        self._key = key

    def is_set(self) -> bool:
        try:
            v = self._client.get(self._key)
        except Exception:
            return False
        return bool(v and str(v).strip())


@runtime_checkable
class CancelEvent(Protocol):
    def is_set(self) -> bool: ...


class RedisRequestRegistry:
    """
    Redis-backed cancellation + fixed-window rate limiting.

    Notes:
    - `get_cancel_event()` returns a lightweight object with `.is_set()` semantics (duck-typed).
    - Rate limiting uses fixed window buckets; good enough for API protection and cross-process consistency.
    """

    def __init__(self):
        self._client = create_redis_client()
        self._prefix = str(os.environ.get("RAGINT_REDIS_PREFIX") or "ragint").strip() or "ragint"
        self._ttl_s = float(os.environ.get("RAGINT_REDIS_TTL_S") or 600.0)

    def _k(self, *parts: str) -> str:
        clean = [str(p).strip() for p in parts if str(p).strip()]
        return ":".join([self._prefix] + clean)

    def rate_allow(self, client_id: str, kind: str, *, limit: int, window_s: float) -> bool:
        cid = str(client_id or "-").strip() or "-"
        k = str(kind or "ask").strip() or "ask"
        now = time.time()
        bucket = int(now // max(0.1, float(window_s)))
        key = self._k("rl", cid, k, str(bucket))
        try:
            pipe = self._client.pipeline()
            pipe.incr(key, 1)
            pipe.expire(key, int(max(1.0, float(window_s) * 2.0)))
            count, _ = pipe.execute()
            return int(count) <= int(limit)
        except Exception:
            # Fail-open to avoid hard outages when Redis is transiently unavailable.
            return True

    def register(
        self,
        *,
        client_id: str,
        request_id: str,
        kind: str,
        cancel_previous: bool = True,
        cancel_reason: str = "replaced_by_new",
    ) -> CancelEvent:
        cid = str(client_id or "-").strip() or "-"
        rid = str(request_id or "").strip()
        k = str(kind or "ask").strip() or "ask"
        if not rid:
            raise ValueError("request_id_empty")

        active_key = self._k("active", cid, k)
        if cancel_previous:
            try:
                prev = self._client.get(active_key)
            except Exception:
                prev = None
            if prev and str(prev).strip() and str(prev).strip() != rid:
                self.cancel(str(prev).strip(), reason=cancel_reason)

        info_key = self._k("info", rid)
        try:
            now = time.time()
            pipe = self._client.pipeline()
            pipe.hset(
                info_key,
                mapping={
                    "request_id": rid,
                    "client_id": cid,
                    "kind": k,
                    "created_at": str(now),
                    "canceled_at": "",
                    "cancel_reason": "",
                },
            )
            pipe.expire(info_key, int(max(10.0, self._ttl_s)))
            pipe.set(active_key, rid, ex=int(max(10.0, self._ttl_s)))
            pipe.execute()
        except Exception:
            pass

        return self.get_cancel_event(rid)

    def clear_active(self, *, client_id: str, kind: str, request_id: str) -> None:
        cid = str(client_id or "-").strip() or "-"
        k = str(kind or "ask").strip() or "ask"
        rid = str(request_id or "").strip()
        if not rid:
            return
        active_key = self._k("active", cid, k)
        try:
            cur = self._client.get(active_key)
            if cur and str(cur).strip() == rid:
                self._client.delete(active_key)
        except Exception:
            return

    def cancel(self, request_id: str, *, reason: str = "cancelled") -> bool:
        rid = str(request_id or "").strip()
        if not rid:
            return False
        cancel_key = self._k("cancel", rid)
        info_key = self._k("info", rid)
        now = time.time()
        try:
            pipe = self._client.pipeline()
            pipe.set(cancel_key, "1", ex=int(max(10.0, self._ttl_s)))
            pipe.hset(info_key, mapping={"canceled_at": str(now), "cancel_reason": str(reason or "cancelled")})
            pipe.expire(info_key, int(max(10.0, self._ttl_s)))
            pipe.execute()
            return True
        except Exception:
            return True

    def cancel_active(self, *, client_id: str, kind: str, reason: str = "cancelled") -> str | None:
        cid = str(client_id or "-").strip() or "-"
        k = str(kind or "ask").strip() or "ask"
        active_key = self._k("active", cid, k)
        try:
            rid = self._client.get(active_key)
        except Exception:
            rid = None
        if not rid or not str(rid).strip():
            return None
        self.cancel(str(rid).strip(), reason=reason)
        return str(rid).strip()

    def get_cancel_event(self, request_id: str) -> CancelEvent:
        rid = str(request_id or "").strip()
        if not rid:
            return threading.Event()
        return _RedisCancelEvent(self._client, key=self._k("cancel", rid))

    def is_cancelled(self, request_id: str) -> bool:
        rid = str(request_id or "").strip()
        if not rid:
            return False
        try:
            v = self._client.get(self._k("cancel", rid))
        except Exception:
            return False
        return bool(v and str(v).strip())

    def get_info(self, request_id: str) -> dict | None:
        rid = str(request_id or "").strip()
        if not rid:
            return None
        try:
            data = self._client.hgetall(self._k("info", rid)) or {}
        except Exception:
            return None
        if not isinstance(data, dict) or not data:
            return None

        def fnum(v):
            try:
                return float(v) if str(v).strip() else None
            except Exception:
                return None

        return {
            "request_id": str(data.get("request_id") or rid),
            "client_id": str(data.get("client_id") or "-"),
            "kind": str(data.get("kind") or "unknown"),
            "created_at": fnum(data.get("created_at")),
            "canceled_at": fnum(data.get("canceled_at")),
            "cancel_reason": str(data.get("cancel_reason") or "") or None,
        }
