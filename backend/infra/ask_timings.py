from __future__ import annotations

import threading
import time


class AskTimings:
    def __init__(self):
        self._lock = threading.Lock()
        self._items: dict[str, dict] = {}

    def _prune(self, now_perf: float, *, ttl_s: float = 300.0, max_items: int = 500) -> None:
        with self._lock:
            items = list(self._items.items())
            for rid, value in items:
                t_submit = value.get("t_submit")
                if isinstance(t_submit, (int, float)) and (now_perf - float(t_submit)) > float(ttl_s):
                    self._items.pop(rid, None)

            if len(self._items) > int(max_items):
                ordered = sorted(
                    self._items.items(),
                    key=lambda kv: float(kv[1].get("t_submit", now_perf)),
                )
                for rid, _ in ordered[: max(0, len(self._items) - int(max_items))]:
                    self._items.pop(rid, None)

    def set(self, request_id: str, **fields) -> None:
        rid = str(request_id or "").strip()
        if not rid:
            return
        now_perf = time.perf_counter()
        self._prune(now_perf)
        with self._lock:
            entry = self._items.get(rid) or {}
            entry.update(fields)
            self._items[rid] = entry

    def get(self, request_id: str) -> dict | None:
        rid = str(request_id or "").strip()
        if not rid:
            return None
        with self._lock:
            entry = self._items.get(rid)
            return dict(entry) if isinstance(entry, dict) else None

