from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from dataclasses import dataclass

from backend.infra.redis_client import create_redis_client


@dataclass(frozen=True)
class EventRecord:
    ts_ms: int
    request_id: str
    client_id: str
    kind: str
    name: str
    level: str
    fields: dict

    def to_dict(self) -> dict:
        return {
            "ts_ms": int(self.ts_ms),
            "request_id": self.request_id,
            "client_id": self.client_id,
            "kind": self.kind,
            "name": self.name,
            "level": self.level,
            "fields": dict(self.fields or {}),
        }

    def to_ndjson(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


class EventStore:
    """
    In-process event timeline store for observability/debugging.
    - Keeps a global ring buffer and per-request ring buffers.
    - Safe for multi-threaded Flask usage.
    """

    def __init__(
        self,
        *,
        per_request_max: int = 300,
        global_max: int = 5000,
        ttl_s: float = 3600.0,
    ):
        self._per_request_max = max(50, int(per_request_max or 300))
        self._global_max = max(200, int(global_max or 5000))
        self._ttl_s = max(60.0, float(ttl_s or 3600.0))

        self._lock = threading.Lock()
        self._global: deque[EventRecord] = deque(maxlen=self._global_max)
        self._per_request: dict[str, deque[EventRecord]] = {}

    def _prune(self, *, now_s: float) -> None:
        cutoff_ms = int((now_s - self._ttl_s) * 1000)
        # Global deque is bounded; pruning is best-effort (drop stale from left).
        while self._global and self._global[0].ts_ms < cutoff_ms:
            self._global.popleft()

        # Per-request deques are bounded; remove whole request buffers if stale.
        stale = []
        for rid, dq in self._per_request.items():
            while dq and dq[0].ts_ms < cutoff_ms:
                dq.popleft()
            if not dq:
                stale.append(rid)
        for rid in stale:
            self._per_request.pop(rid, None)

    def emit(
        self,
        *,
        request_id: str,
        client_id: str = "-",
        kind: str,
        name: str,
        level: str = "info",
        **fields,
    ) -> None:
        rid = str(request_id or "").strip()
        if not rid:
            return
        rec = EventRecord(
            ts_ms=int(time.time() * 1000),
            request_id=rid,
            client_id=str(client_id or "-").strip() or "-",
            kind=str(kind or "app").strip() or "app",
            name=str(name or "event").strip() or "event",
            level=str(level or "info").strip() or "info",
            fields=dict(fields or {}),
        )
        now_s = time.time()
        with self._lock:
            self._prune(now_s=now_s)
            self._global.append(rec)
            dq = self._per_request.get(rid)
            if dq is None:
                dq = deque(maxlen=self._per_request_max)
                self._per_request[rid] = dq
            dq.append(rec)

    def list_events(self, *, request_id: str, limit: int = 200, since_ms: int | None = None) -> list[dict]:
        rid = str(request_id or "").strip()
        if not rid:
            return []
        limit = max(1, min(int(limit or 200), self._per_request_max))
        with self._lock:
            dq = self._per_request.get(rid)
            if not dq:
                return []
            items = list(dq)
        if since_ms is not None:
            try:
                since_ms = int(since_ms)
            except Exception:
                since_ms = None
        if since_ms is not None:
            items = [e for e in items if int(e.ts_ms) >= int(since_ms)]
        return [e.to_dict() for e in items[-limit:]]

    def list_recent(self, *, limit: int = 300, since_ms: int | None = None) -> list[dict]:
        limit = max(1, min(int(limit or 300), self._global_max))
        with self._lock:
            items = list(self._global)
        if since_ms is not None:
            try:
                since_ms = int(since_ms)
            except Exception:
                since_ms = None
        if since_ms is not None:
            items = [e for e in items if int(e.ts_ms) >= int(since_ms)]
        return [e.to_dict() for e in items[-limit:]]

    def last_error(self, *, request_id: str) -> dict | None:
        rid = str(request_id or "").strip()
        if not rid:
            return None
        with self._lock:
            dq = self._per_request.get(rid)
            if not dq:
                return None
            items = list(dq)
        for e in reversed(items):
            if (e.level or "").lower() in ("error", "fatal"):
                return e.to_dict()
        return None


class RedisEventStore:
    """
    Redis-backed event timeline store.

    Data model (lists of JSON strings):
    - `${prefix}:events:global`
    - `${prefix}:events:rid:{request_id}`
    """

    def __init__(
        self,
        *,
        per_request_max: int = 300,
        global_max: int = 5000,
        ttl_s: float = 3600.0,
        prefix_env: str = "RAGINT_REDIS_PREFIX",
    ):
        self._per_request_max = max(50, int(per_request_max or 300))
        self._global_max = max(200, int(global_max or 5000))
        self._ttl_s = max(60.0, float(ttl_s or 3600.0))
        self._client = create_redis_client()
        self._prefix = str(os.environ.get(prefix_env) or "ragint").strip() or "ragint"

    def _k(self, *parts: str) -> str:
        clean = [str(p).strip() for p in parts if str(p).strip()]
        return ":".join([self._prefix] + clean)

    def emit(
        self,
        *,
        request_id: str,
        client_id: str = "-",
        kind: str,
        name: str,
        level: str = "info",
        **fields,
    ) -> None:
        rid = str(request_id or "").strip()
        if not rid:
            return
        rec = EventRecord(
            ts_ms=int(time.time() * 1000),
            request_id=rid,
            client_id=str(client_id or "-").strip() or "-",
            kind=str(kind or "app").strip() or "app",
            name=str(name or "event").strip() or "event",
            level=str(level or "info").strip() or "info",
            fields=dict(fields or {}),
        )
        raw = rec.to_ndjson()
        try:
            gk = self._k("events", "global")
            rk = self._k("events", "rid", rid)
            pipe = self._client.pipeline()
            pipe.lpush(gk, raw)
            pipe.ltrim(gk, 0, self._global_max - 1)
            pipe.lpush(rk, raw)
            pipe.ltrim(rk, 0, self._per_request_max - 1)
            pipe.expire(rk, int(max(60.0, self._ttl_s)))
            pipe.execute()
        except Exception:
            return

    def _load_list(self, key: str, *, limit: int) -> list[dict]:
        try:
            raws = self._client.lrange(key, 0, max(0, limit - 1)) or []
        except Exception:
            return []
        items = []
        for s in reversed(list(raws)):  # restore chronological order (oldest->newest)
            try:
                obj = json.loads(s)
            except Exception:
                continue
            if isinstance(obj, dict):
                items.append(obj)
        return items

    def list_events(self, *, request_id: str, limit: int = 200, since_ms: int | None = None) -> list[dict]:
        rid = str(request_id or "").strip()
        if not rid:
            return []
        limit = max(1, min(int(limit or 200), self._per_request_max))
        items = self._load_list(self._k("events", "rid", rid), limit=limit)
        if since_ms is not None:
            try:
                since_ms = int(since_ms)
            except Exception:
                since_ms = None
        if since_ms is not None:
            items = [e for e in items if int(e.get("ts_ms") or 0) >= int(since_ms)]
        return items[-limit:]

    def list_recent(self, *, limit: int = 300, since_ms: int | None = None) -> list[dict]:
        limit = max(1, min(int(limit or 300), self._global_max))
        items = self._load_list(self._k("events", "global"), limit=limit)
        if since_ms is not None:
            try:
                since_ms = int(since_ms)
            except Exception:
                since_ms = None
        if since_ms is not None:
            items = [e for e in items if int(e.get("ts_ms") or 0) >= int(since_ms)]
        return items[-limit:]

    def last_error(self, *, request_id: str) -> dict | None:
        rid = str(request_id or "").strip()
        if not rid:
            return None
        items = self._load_list(self._k("events", "rid", rid), limit=self._per_request_max)
        for e in reversed(items):
            if str(e.get("level") or "").lower() in ("error", "fatal"):
                return e
        return None

