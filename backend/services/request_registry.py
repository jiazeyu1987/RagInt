from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass


@dataclass
class RequestInfo:
    request_id: str
    client_id: str
    kind: str  # 'ask' | 'tts' | 'asr' | other
    created_at: float
    canceled_at: float | None = None
    cancel_reason: str | None = None


class RequestRegistry:
    """
    In-process cancellation + basic rate limiting.
    - Each request_id has a cancel Event
    - Each (client_id, kind) keeps a single active request_id (new cancels old)
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._cancel_events: dict[str, threading.Event] = {}
        self._infos: dict[str, RequestInfo] = {}
        self._active: dict[tuple[str, str], str] = {}
        self._client_hits: dict[tuple[str, str], deque[float]] = defaultdict(lambda: deque(maxlen=200))

    def _prune(self, now: float, ttl_s: float = 600.0, max_items: int = 2000) -> None:
        with self._lock:
            if len(self._infos) <= max_items:
                keys = list(self._infos.keys())
            else:
                keys = list(self._infos.keys())
            for rid in keys:
                info = self._infos.get(rid)
                if not info:
                    continue
                base = info.canceled_at if info.canceled_at is not None else info.created_at
                if now - float(base) > ttl_s:
                    self._infos.pop(rid, None)
                    self._cancel_events.pop(rid, None)
            # active map cleanup (best-effort)
            for key, rid in list(self._active.items()):
                if rid not in self._infos:
                    self._active.pop(key, None)

    def rate_allow(self, client_id: str, kind: str, *, limit: int, window_s: float) -> bool:
        now = time.perf_counter()
        self._prune(now)
        k = (str(client_id or "-"), str(kind or "ask"))
        with self._lock:
            dq = self._client_hits[k]
            # drop old
            while dq and (now - dq[0]) > float(window_s):
                dq.popleft()
            if len(dq) >= int(limit):
                return False
            dq.append(now)
            return True

    def register(
        self,
        *,
        client_id: str,
        request_id: str,
        kind: str,
        cancel_previous: bool = True,
        cancel_reason: str = "replaced_by_new",
    ) -> threading.Event:
        now = time.perf_counter()
        self._prune(now)
        client_id = str(client_id or "-").strip() or "-"
        request_id = str(request_id or "").strip()
        kind = str(kind or "ask").strip() or "ask"
        if not request_id:
            raise ValueError("request_id_empty")

        prev_id: str | None = None
        with self._lock:
            key = (client_id, kind)
            prev_id = self._active.get(key)

        if cancel_previous and prev_id and prev_id != request_id:
            self.cancel(prev_id, reason=cancel_reason)

        with self._lock:
            ev = self._cancel_events.get(request_id)
            if ev is None:
                ev = threading.Event()
                self._cancel_events[request_id] = ev
            self._infos[request_id] = RequestInfo(
                request_id=request_id,
                client_id=client_id,
                kind=kind,
                created_at=now,
                canceled_at=self._infos.get(request_id).canceled_at if request_id in self._infos else None,
                cancel_reason=self._infos.get(request_id).cancel_reason if request_id in self._infos else None,
            )
            self._active[(client_id, kind)] = request_id
            return ev

    def clear_active(self, *, client_id: str, kind: str, request_id: str) -> None:
        client_id = str(client_id or "-").strip() or "-"
        kind = str(kind or "ask").strip() or "ask"
        request_id = str(request_id or "").strip()
        if not request_id:
            return
        with self._lock:
            key = (client_id, kind)
            if self._active.get(key) == request_id:
                self._active.pop(key, None)

    def cancel(self, request_id: str, *, reason: str = "cancelled") -> bool:
        now = time.perf_counter()
        self._prune(now)
        rid = str(request_id or "").strip()
        if not rid:
            return False
        with self._lock:
            ev = self._cancel_events.get(rid)
            if ev is None:
                ev = threading.Event()
                self._cancel_events[rid] = ev
            ev.set()
            info = self._infos.get(rid)
            if info is None:
                info = RequestInfo(request_id=rid, client_id="-", kind="unknown", created_at=now)
            info.canceled_at = now
            info.cancel_reason = str(reason or "cancelled")
            self._infos[rid] = info
            return True

    def cancel_active(self, *, client_id: str, kind: str, reason: str = "cancelled") -> str | None:
        client_id = str(client_id or "-").strip() or "-"
        kind = str(kind or "ask").strip() or "ask"
        with self._lock:
            rid = self._active.get((client_id, kind))
        if not rid:
            return None
        self.cancel(rid, reason=reason)
        return rid

    def cancel_all_active(self, *, client_id: str, reason: str = "cancelled") -> list[str]:
        """
        Cancel all active requests for a given client_id across all kinds.
        Returns the list of cancelled request_ids.
        """
        client_id = str(client_id or "-").strip() or "-"
        with self._lock:
            targets = [rid for (cid, _kind), rid in self._active.items() if cid == client_id and rid]
        cancelled: list[str] = []
        for rid in targets:
            if self.cancel(rid, reason=reason):
                cancelled.append(rid)
        return cancelled

    def get_cancel_event(self, request_id: str) -> threading.Event:
        rid = str(request_id or "").strip()
        if not rid:
            return threading.Event()
        now = time.perf_counter()
        self._prune(now)
        with self._lock:
            ev = self._cancel_events.get(rid)
            if ev is None:
                ev = threading.Event()
                self._cancel_events[rid] = ev
            return ev

    def is_cancelled(self, request_id: str) -> bool:
        rid = str(request_id or "").strip()
        if not rid:
            return False
        with self._lock:
            ev = self._cancel_events.get(rid)
            return bool(ev and ev.is_set())

    def get_info(self, request_id: str) -> dict | None:
        rid = str(request_id or "").strip()
        if not rid:
            return None
        now = time.perf_counter()
        self._prune(now)
        with self._lock:
            info = self._infos.get(rid)
            if not info:
                return None
            return {
                "request_id": info.request_id,
                "client_id": info.client_id,
                "kind": info.kind,
                "created_at": info.created_at,
                "canceled_at": info.canceled_at,
                "cancel_reason": info.cancel_reason,
            }
