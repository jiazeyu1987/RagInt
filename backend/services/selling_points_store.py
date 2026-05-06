from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SellingPoint:
    stop_name: str
    text: str
    weight: float
    tags: tuple[str, ...]
    level: str
    status: str
    updated_at_ms: int


class SellingPointsStore:
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
                    CREATE TABLE IF NOT EXISTS selling_points (
                        stop_name TEXT NOT NULL,
                        text TEXT NOT NULL,
                        weight REAL NOT NULL DEFAULT 0,
                        tags_json TEXT NOT NULL DEFAULT "[]",
                        level TEXT NOT NULL DEFAULT "public",
                        status TEXT NOT NULL DEFAULT "published",
                        updated_at_ms INTEGER NOT NULL,
                        PRIMARY KEY (stop_name, text)
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_sp_stop_weight ON selling_points(stop_name, weight DESC, updated_at_ms DESC);")
                conn.commit()
            finally:
                conn.close()

    def _ensure_column(self, *, conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
        try:
            cols = conn.execute(f"PRAGMA table_info({table});").fetchall() or []
            names = {str(r[1]) for r in cols if len(r) >= 2}
            if column in names:
                return
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl};")
        except Exception:
            return

    @staticmethod
    def _normalize_level(level: str | None, *, default: str | None = "public") -> str:
        v = str(level or "").strip().lower()
        if not v and default is not None:
            return default
        if v in ("public", "internal", "sensitive"):
            return v
        raise ValueError("selling_points_level_invalid")

    @staticmethod
    def _normalize_status(status: str | None, *, default: str | None = "published") -> str:
        v = str(status or "").strip().lower()
        if not v and default is not None:
            return default
        if v in ("draft", "review", "published"):
            return v
        raise ValueError("selling_points_status_invalid")

    @staticmethod
    def _levels_upto(max_level: str) -> tuple[str, ...]:
        order = ("public", "internal", "sensitive")
        idx = order.index(SellingPointsStore._normalize_level(max_level, default=None))
        return order[: idx + 1]

    @staticmethod
    def _parse_tags_json(raw: object, *, stop_name: str, text: str) -> list[object]:
        try:
            tags = json.loads(str(raw))
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid selling_points.tags_json for stop_name={stop_name!r} text={text!r}") from exc
        if not isinstance(tags, list):
            raise ValueError(f"invalid selling_points.tags_json for stop_name={stop_name!r} text={text!r}: expected list")
        return tags

    def upsert(
        self,
        *,
        stop_name: str,
        text: str,
        weight: float = 0.0,
        tags: list[str] | None = None,
        level: str | None = None,
        status: str | None = None,
        now_ms: int | None = None,
    ) -> bool:
        sn = str(stop_name or "").strip()
        t = str(text or "").strip()
        if not sn or not t:
            return False
        try:
            w = float(weight)
        except Exception:
            raise ValueError("selling_points_weight_invalid") from None
        w = max(-1000.0, min(w, 1000.0))
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        tag_list = [str(x).strip() for x in (tags or []) if str(x).strip()]
        tags_json = json.dumps(tag_list, ensure_ascii=False, separators=(",", ":"))
        lvl = self._normalize_level(level)
        st = self._normalize_status(status)

        with self._lock:
            conn = self._connect()
            try:
                self._ensure_column(conn=conn, table="selling_points", column="level", ddl='level TEXT NOT NULL DEFAULT "public"')
                self._ensure_column(conn=conn, table="selling_points", column="status", ddl='status TEXT NOT NULL DEFAULT "published"')
                conn.execute(
                    """
                    INSERT INTO selling_points (stop_name, text, weight, tags_json, level, status, updated_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(stop_name, text) DO UPDATE SET
                        weight = excluded.weight,
                        tags_json = excluded.tags_json,
                        level = excluded.level,
                        status = excluded.status,
                        updated_at_ms = excluded.updated_at_ms
                    """,
                    (sn, t, float(w), tags_json, lvl, st, int(now_ms)),
                )
                conn.commit()
                return True
            finally:
                conn.close()

    def delete(self, *, stop_name: str, text: str) -> bool:
        sn = str(stop_name or "").strip()
        t = str(text or "").strip()
        if not sn or not t:
            return False
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute("DELETE FROM selling_points WHERE stop_name = ? AND text = ?", (sn, t))
                conn.commit()
                return int(cur.rowcount or 0) > 0
            finally:
                conn.close()

    def list(self, *, stop_name: str, limit: int = 50, status: str | None = "published", max_level: str | None = None) -> list[SellingPoint]:
        sn = str(stop_name or "").strip()
        if not sn:
            return []
        limit = max(1, min(int(limit or 50), 200))
        st = None if status is None else self._normalize_status(status)
        levels = None if max_level is None else self._levels_upto(str(max_level))
        with self._lock:
            conn = self._connect()
            try:
                self._ensure_column(conn=conn, table="selling_points", column="level", ddl='level TEXT NOT NULL DEFAULT "public"')
                self._ensure_column(conn=conn, table="selling_points", column="status", ddl='status TEXT NOT NULL DEFAULT "published"')

                where = ["stop_name = ?"]
                params: list[object] = [sn]
                if st is not None:
                    where.append("status = ?")
                    params.append(st)
                if levels is not None:
                    where.append("level IN (" + ",".join("?" for _ in levels) + ")")
                    params.extend(list(levels))

                rows = conn.execute(
                    """
                    SELECT stop_name, text, weight, tags_json, level, status, updated_at_ms
                    FROM selling_points
                    WHERE """
                    + " AND ".join(where)
                    + """
                    ORDER BY weight DESC, updated_at_ms DESC
                    LIMIT ?
                    """,
                    tuple(params + [limit]),
                ).fetchall()
                out: list[SellingPoint] = []
                for r in rows:
                    row_stop_name = str(r["stop_name"] or sn)
                    row_text = str(r["text"] or "")
                    tags = self._parse_tags_json(r["tags_json"], stop_name=row_stop_name, text=row_text)
                    out.append(
                        SellingPoint(
                            stop_name=row_stop_name,
                            text=row_text,
                            weight=float(r["weight"] or 0.0),
                            tags=tuple(str(x).strip() for x in tags if str(x).strip()),
                            level=self._normalize_level(str(r["level"] or ""), default=None),
                            status=self._normalize_status(str(r["status"] or ""), default=None),
                            updated_at_ms=int(r["updated_at_ms"] or 0),
                        )
                    )
                return out
            finally:
                conn.close()

    def set_status(self, *, stop_name: str, text: str, status: str, now_ms: int | None = None) -> bool:
        sn = str(stop_name or "").strip()
        t = str(text or "").strip()
        st = self._normalize_status(status, default=None)
        if not sn or not t:
            return False
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        with self._lock:
            conn = self._connect()
            try:
                self._ensure_column(conn=conn, table="selling_points", column="status", ddl='status TEXT NOT NULL DEFAULT "published"')
                cur = conn.execute(
                    """
                    UPDATE selling_points
                    SET status = ?, updated_at_ms = ?
                    WHERE stop_name = ? AND text = ?
                    """,
                    (st, int(now_ms), sn, t),
                )
                conn.commit()
                return int(cur.rowcount or 0) > 0
            finally:
                conn.close()

    def transition_status(self, *, stop_name: str, text: str, action: str) -> str | None:
        act = str(action or "").strip().lower()
        sn = str(stop_name or "").strip()
        t = str(text or "").strip()
        if not sn or not t:
            return None

        current = None
        with self._lock:
            conn = self._connect()
            try:
                self._ensure_column(conn=conn, table="selling_points", column="status", ddl='status TEXT NOT NULL DEFAULT "published"')
                row = conn.execute(
                    "SELECT status FROM selling_points WHERE stop_name = ? AND text = ?",
                    (sn, t),
                ).fetchone()
                current = self._normalize_status(str(row["status"]), default=None) if row else None
            finally:
                conn.close()

        if current is None:
            return None

        nxt = None
        if act in ("submit", "review"):
            nxt = "review" if current == "draft" else current
        elif act in ("approve", "publish"):
            nxt = "published" if current in ("review",) else current
        elif act in ("reject", "back"):
            nxt = "draft" if current in ("review",) else current
        else:
            return None

        if nxt and nxt != current:
            ok = self.set_status(stop_name=sn, text=t, status=nxt)
            return nxt if ok else None
        return current

    @staticmethod
    def pick_topn(*, points: list[SellingPoint], n: int) -> list[SellingPoint]:
        try:
            n = max(0, min(int(n or 0), 20))
        except Exception:
            raise ValueError("selling_points_topn_invalid") from None
        if n <= 0:
            return []
        # already sorted by weight desc in list(), but keep stable behavior if caller passes unsorted list
        ordered = sorted(points, key=lambda p: (-float(p.weight), -int(p.updated_at_ms)))
        return ordered[:n]
