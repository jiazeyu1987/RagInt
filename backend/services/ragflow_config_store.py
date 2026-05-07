from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RagflowConfigRecord:
    scope_id: str
    config: dict
    created_at_ms: int
    updated_at_ms: int


class RagflowConfigStoreCorruptError(RuntimeError):
    def __init__(self, scope_id: str, reason: str):
        self.code = "ragflow_config_store_corrupt"
        self.scope_id = str(scope_id or "").strip() or "global"
        self.reason = str(reason or "invalid stored config").strip()
        super().__init__(f"{self.code}: scope_id={self.scope_id!r}: {self.reason}")


class RagflowConfigStore:
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
                    CREATE TABLE IF NOT EXISTS ragflow_config (
                        scope_id TEXT NOT NULL PRIMARY KEY,
                        config_json TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_ragflow_config_updated_at ON ragflow_config(updated_at_ms);")
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _row_to_record(row, *, fallback_scope_id: str = "") -> RagflowConfigRecord | None:
        if not row:
            return None
        sid = str(row["scope_id"] or fallback_scope_id or "").strip()
        try:
            if not sid:
                raise ValueError("ragflow_config.scope_id must be non-empty for existing records")
            raw_config = row["config_json"]
            if raw_config is None:
                raise ValueError("ragflow_config.config_json is required")
            cfg = json.loads(str(raw_config))
            if not isinstance(cfg, dict):
                raise ValueError("ragflow_config.config_json must decode to an object")
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            raise RagflowConfigStoreCorruptError(sid or fallback_scope_id, str(e)) from e
        return RagflowConfigRecord(
            scope_id=sid,
            config=cfg,
            created_at_ms=int(row["created_at_ms"] or 0),
            updated_at_ms=int(row["updated_at_ms"] or 0),
        )

    def get(self, *, scope_id: str = "global") -> RagflowConfigRecord | None:
        sid = str(scope_id or "").strip() or "global"
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT scope_id, config_json, created_at_ms, updated_at_ms
                    FROM ragflow_config
                    WHERE scope_id = ?
                    """,
                    (sid,),
                ).fetchone()
                return self._row_to_record(row, fallback_scope_id=sid)
            finally:
                conn.close()

    def upsert(self, *, scope_id: str = "global", config: dict, now_ms: int | None = None) -> RagflowConfigRecord | None:
        sid = str(scope_id or "").strip() or "global"
        if not isinstance(config, dict):
            raise TypeError("config must be a dict")
        cfg = config
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        payload = json.dumps(cfg, ensure_ascii=False, separators=(",", ":"))

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO ragflow_config (scope_id, config_json, created_at_ms, updated_at_ms)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(scope_id) DO UPDATE SET
                        config_json = excluded.config_json,
                        updated_at_ms = excluded.updated_at_ms
                    """,
                    (sid, payload, int(now_ms), int(now_ms)),
                )
                conn.commit()
            finally:
                conn.close()

        return self.get(scope_id=sid)
