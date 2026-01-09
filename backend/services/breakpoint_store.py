from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BreakpointRecord:
    kind: str
    client_id: str
    state: dict
    created_at_ms: int
    updated_at_ms: int


class BreakpointStore:
    def __init__(self, db_path: Path, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._db_path = Path(db_path)
        self._lock = threading.Lock()
        self._ensure_db()

    def _connect(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_db(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS breakpoints (
                        kind TEXT NOT NULL,
                        client_id TEXT NOT NULL,
                        state_json TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL,
                        PRIMARY KEY (kind, client_id)
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_breakpoints_updated_at ON breakpoints(updated_at_ms);")
                conn.commit()
            finally:
                conn.close()

    def get(self, *, kind: str, client_id: str) -> BreakpointRecord | None:
        k = str(kind or "").strip() or "tour"
        cid = str(client_id or "").strip()
        if not cid:
            return None

        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT kind, client_id, state_json, created_at_ms, updated_at_ms
                    FROM breakpoints
                    WHERE kind = ? AND client_id = ?
                    """,
                    (k, cid),
                ).fetchone()
                if not row:
                    return None
                try:
                    state = json.loads(str(row["state_json"] or "{}"))
                except Exception:
                    state = {}
                if not isinstance(state, dict):
                    state = {}
                return BreakpointRecord(
                    kind=str(row["kind"] or k),
                    client_id=str(row["client_id"] or cid),
                    state=state,
                    created_at_ms=int(row["created_at_ms"] or 0),
                    updated_at_ms=int(row["updated_at_ms"] or 0),
                )
            finally:
                conn.close()

    def upsert(self, *, kind: str, client_id: str, state: dict, now_ms: int | None = None) -> BreakpointRecord | None:
        k = str(kind or "").strip() or "tour"
        cid = str(client_id or "").strip()
        if not cid or not isinstance(state, dict):
            return None
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO breakpoints (kind, client_id, state_json, created_at_ms, updated_at_ms)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(kind, client_id) DO UPDATE SET
                        state_json = excluded.state_json,
                        updated_at_ms = excluded.updated_at_ms
                    """,
                    (k, cid, payload, int(now_ms), int(now_ms)),
                )
                conn.commit()
            finally:
                conn.close()

        return self.get(kind=k, client_id=cid)

    def clear(self, *, kind: str, client_id: str) -> bool:
        k = str(kind or "").strip() or "tour"
        cid = str(client_id or "").strip()
        if not cid:
            return False
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute("DELETE FROM breakpoints WHERE kind = ? AND client_id = ?", (k, cid))
                conn.commit()
                return int(cur.rowcount or 0) > 0
            finally:
                conn.close()

