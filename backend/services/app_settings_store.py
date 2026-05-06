from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppSettingsRecord:
    scope_id: str
    settings: dict
    created_at_ms: int
    updated_at_ms: int


class AppSettingsStore:
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
                    CREATE TABLE IF NOT EXISTS app_settings (
                        scope_id TEXT NOT NULL PRIMARY KEY,
                        settings_json TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at_ms);")
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _row_to_record(row, *, fallback_scope_id: str = "") -> AppSettingsRecord | None:
        if not row:
            return None
        sid = str(row["scope_id"] or fallback_scope_id or "").strip()
        if not sid:
            return None
        settings = json.loads(str(row["settings_json"] or "{}"))
        if not isinstance(settings, dict):
            raise ValueError("app_settings_json_invalid")
        return AppSettingsRecord(
            scope_id=sid,
            settings=settings,
            created_at_ms=int(row["created_at_ms"] or 0),
            updated_at_ms=int(row["updated_at_ms"] or 0),
        )

    def get(self, *, scope_id: str) -> AppSettingsRecord | None:
        sid = str(scope_id or "").strip()
        if not sid:
            return None

        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT scope_id, settings_json, created_at_ms, updated_at_ms
                    FROM app_settings
                    WHERE scope_id = ?
                    """,
                    (sid,),
                ).fetchone()
                return self._row_to_record(row, fallback_scope_id=sid)
            finally:
                conn.close()

    def get_latest(self) -> AppSettingsRecord | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT scope_id, settings_json, created_at_ms, updated_at_ms
                    FROM app_settings
                    ORDER BY updated_at_ms DESC, created_at_ms DESC
                    LIMIT 1
                    """
                ).fetchone()
                return self._row_to_record(row)
            finally:
                conn.close()

    def upsert(self, *, scope_id: str, settings: dict, now_ms: int | None = None) -> AppSettingsRecord | None:
        sid = str(scope_id or "").strip()
        if not sid or not isinstance(settings, dict):
            return None
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        payload = json.dumps(settings, ensure_ascii=False, separators=(",", ":"))

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO app_settings (scope_id, settings_json, created_at_ms, updated_at_ms)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(scope_id) DO UPDATE SET
                        settings_json = excluded.settings_json,
                        updated_at_ms = excluded.updated_at_ms
                    """,
                    (sid, payload, int(now_ms), int(now_ms)),
                )
                conn.commit()
            finally:
                conn.close()

        return self.get(scope_id=sid)
