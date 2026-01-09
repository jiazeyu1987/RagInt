from __future__ import annotations

import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from backend.services.question_normalizer import normalize_question


@dataclass(frozen=True)
class HistoryEntry:
    id: int
    request_id: str
    question: str
    answer: str
    created_at_ms: int
    mode: str
    chat_name: str
    agent_id: str


class HistoryStore:
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
                    CREATE TABLE IF NOT EXISTS qa_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        request_id TEXT,
                        question TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        mode TEXT NOT NULL,
                        chat_name TEXT,
                        agent_id TEXT
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_qa_history_created_at ON qa_history(created_at_ms);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_qa_history_question ON qa_history(question);")

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS qa_cache (
                        normalized_question TEXT NOT NULL,
                        kb_version TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL,
                        expires_at_ms INTEGER NOT NULL,
                        hit_count INTEGER NOT NULL DEFAULT 0,
                        last_hit_at_ms INTEGER,
                        PRIMARY KEY (normalized_question, kb_version)
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_qa_cache_expires_at ON qa_cache(expires_at_ms);")
                conn.commit()
            finally:
                conn.close()

    def add_entry(
        self,
        *,
        request_id: str,
        question: str,
        answer: str,
        mode: str,
        chat_name: str = "",
        agent_id: str = "",
        created_at_ms: int | None = None,
    ) -> int:
        q = str(question or "").strip()
        a = str(answer or "").strip()
        if not q or not a:
            return 0
        if created_at_ms is None:
            created_at_ms = int(time.time() * 1000)

        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """
                    INSERT INTO qa_history (request_id, question, answer, created_at_ms, mode, chat_name, agent_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(request_id or ""),
                        q,
                        a,
                        int(created_at_ms),
                        str(mode or ""),
                        str(chat_name or ""),
                        str(agent_id or ""),
                    ),
                )
                conn.commit()
                return int(cur.lastrowid or 0)
            finally:
                conn.close()

    def list_by_time(self, *, limit: int = 100, desc: bool = True) -> list[dict]:
        limit = max(1, min(int(limit or 100), 500))
        order = "DESC" if desc else "ASC"
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    f"""
                    WITH agg AS (
                        SELECT
                            question,
                            COUNT(1) AS cnt,
                            MAX(created_at_ms) AS last_at_ms
                        FROM qa_history
                        GROUP BY question
                    ),
                    pick AS (
                        SELECT
                            h.question,
                            MAX(h.id) AS last_id
                        FROM qa_history h
                        JOIN agg
                            ON agg.question = h.question AND agg.last_at_ms = h.created_at_ms
                        GROUP BY h.question
                    )
                    SELECT
                        h.id,
                        h.request_id,
                        h.question,
                        h.answer,
                        h.created_at_ms,
                        h.mode,
                        h.chat_name,
                        h.agent_id,
                        agg.cnt
                    FROM qa_history h
                    JOIN pick ON pick.last_id = h.id
                    JOIN agg ON agg.question = h.question
                    ORDER BY agg.last_at_ms {order}, h.id {order}
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

    def list_by_count(self, *, limit: int = 100, desc: bool = True) -> list[dict]:
        limit = max(1, min(int(limit or 100), 500))
        order = "DESC" if desc else "ASC"
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    f"""
                    WITH agg AS (
                        SELECT
                            question,
                            COUNT(1) AS cnt,
                            MAX(created_at_ms) AS last_at_ms
                        FROM qa_history
                        GROUP BY question
                    )
                    SELECT
                        agg.question,
                        agg.cnt,
                        agg.last_at_ms,
                        h.answer AS last_answer,
                        h.mode AS last_mode,
                        h.chat_name AS last_chat_name,
                        h.agent_id AS last_agent_id,
                        h.request_id AS last_request_id,
                        h.id AS last_id
                    FROM agg
                    JOIN qa_history h
                        ON h.question = agg.question AND h.created_at_ms = agg.last_at_ms
                    ORDER BY agg.cnt {order}, agg.last_at_ms DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

    def cache_get(
        self,
        *,
        question: str,
        kb_version: str,
        now_ms: int | None = None,
    ) -> str | None:
        qn = normalize_question(question)
        kv = str(kb_version or "").strip()
        if not qn or not kv:
            return None
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT answer, expires_at_ms
                    FROM qa_cache
                    WHERE normalized_question = ? AND kb_version = ?
                    """,
                    (qn, kv),
                ).fetchone()
                if not row:
                    return None

                expires_at_ms = int(row["expires_at_ms"] or 0)
                if expires_at_ms > 0 and int(now_ms) >= expires_at_ms:
                    conn.execute(
                        "DELETE FROM qa_cache WHERE normalized_question = ? AND kb_version = ?",
                        (qn, kv),
                    )
                    conn.commit()
                    return None

                conn.execute(
                    """
                    UPDATE qa_cache
                    SET hit_count = hit_count + 1, last_hit_at_ms = ?
                    WHERE normalized_question = ? AND kb_version = ?
                    """,
                    (int(now_ms), qn, kv),
                )
                conn.commit()
                return str(row["answer"] or "")
            finally:
                conn.close()

    def cache_put(
        self,
        *,
        question: str,
        answer: str,
        kb_version: str,
        ttl_s: float = 3600.0,
        now_ms: int | None = None,
    ) -> bool:
        qn = normalize_question(question)
        kv = str(kb_version or "").strip()
        a = str(answer or "").strip()
        if not qn or not kv or not a:
            return False

        if now_ms is None:
            now_ms = int(time.time() * 1000)
        ttl_s = float(ttl_s or 0.0)
        expires_at_ms = int(now_ms + max(0.0, ttl_s) * 1000.0) if ttl_s > 0 else 0

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO qa_cache (
                        normalized_question, kb_version, answer,
                        created_at_ms, updated_at_ms, expires_at_ms, hit_count, last_hit_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
                    ON CONFLICT(normalized_question, kb_version) DO UPDATE SET
                        answer = excluded.answer,
                        updated_at_ms = excluded.updated_at_ms,
                        expires_at_ms = excluded.expires_at_ms
                    """,
                    (qn, kv, a, int(now_ms), int(now_ms), int(expires_at_ms)),
                )
                conn.commit()
                return True
            finally:
                conn.close()
