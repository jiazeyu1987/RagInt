from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TourControlCommand:
    id: int
    client_id: str
    action: str
    payload: dict
    created_at_ms: int
    consumed_at_ms: int | None


@dataclass(frozen=True)
class TourControlState:
    client_id: str
    status: str
    paused: bool
    speed: float
    updated_at_ms: int


class TourControlStore:
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
                    CREATE TABLE IF NOT EXISTS tour_control_state (
                        client_id TEXT PRIMARY KEY,
                        status TEXT NOT NULL DEFAULT 'waiting',
                        paused INTEGER NOT NULL DEFAULT 0,
                        speed REAL NOT NULL DEFAULT 1.0,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS tour_control_commands (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        client_id TEXT NOT NULL,
                        action TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        consumed_at_ms INTEGER
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_tcc_client_id_id ON tour_control_commands(client_id, id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_tcc_consumed ON tour_control_commands(consumed_at_ms);")
                self._ensure_status_column(conn=conn)
                conn.commit()
            finally:
                conn.close()

    def _ensure_status_column(self, *, conn: sqlite3.Connection) -> None:
        cols = conn.execute("PRAGMA table_info(tour_control_state);").fetchall() or []
        names = {str(row[1]) for row in cols if len(row) >= 2}
        if "status" not in names:
            conn.execute("ALTER TABLE tour_control_state ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting';")

    def _ensure_state_row(self, *, conn: sqlite3.Connection, client_id: str, now_ms: int) -> None:
        conn.execute(
            """
            INSERT INTO tour_control_state (client_id, status, paused, speed, updated_at_ms)
            VALUES (?, 'waiting', 0, 1.0, ?)
            ON CONFLICT(client_id) DO NOTHING
            """,
            (client_id, int(now_ms)),
        )

    @staticmethod
    def _parse_payload_json(raw: object, *, command_id: int, client_id: str) -> dict:
        try:
            payload = json.loads(str(raw))
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid tour_control_commands.payload_json for id={command_id} client_id={client_id!r}") from exc
        if not isinstance(payload, dict):
            raise ValueError(f"invalid tour_control_commands.payload_json for id={command_id} client_id={client_id!r}: expected object")
        return payload

    @staticmethod
    def _parse_int(raw: object, *, error: str) -> int:
        try:
            return int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(error) from exc

    @staticmethod
    def _parse_float(raw: object, *, error: str) -> float:
        try:
            return float(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(error) from exc

    def get_state(self, *, client_id: str) -> TourControlState | None:
        cid = str(client_id or "").strip()
        if not cid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT client_id, status, paused, speed, updated_at_ms FROM tour_control_state WHERE client_id = ?",
                    (cid,),
                ).fetchone()
                if not row:
                    return None
                return TourControlState(
                    client_id=str(row["client_id"] or cid),
                    status=str(row["status"]),
                    paused=bool(self._parse_int(row["paused"], error="invalid tour_control_state.paused")),
                    speed=self._parse_float(row["speed"], error="invalid tour_control_state.speed"),
                    updated_at_ms=self._parse_int(row["updated_at_ms"], error="invalid tour_control_state.updated_at_ms"),
                )
            finally:
                conn.close()

    def get_queue_depth(self, *, client_id: str) -> int:
        cid = str(client_id or "").strip()
        if not cid:
            return 0
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT COUNT(1) AS cnt
                    FROM tour_control_commands
                    WHERE client_id = ? AND consumed_at_ms IS NULL
                    """,
                    (cid,),
                ).fetchone()
                return int((row["cnt"] if row else 0) or 0)
            finally:
                conn.close()

    def get_effective_status(self, *, client_id: str) -> str:
        st = self.get_state(client_id=client_id)
        if not st:
            return "waiting"
        if bool(st.paused):
            return "paused"
        q = self.get_queue_depth(client_id=client_id)
        if q > 0:
            return "queued"
        s = str(st.status or "").strip().lower()
        if s in ("waiting", "playing"):
            return s
        raise ValueError(f"invalid_tour_control_status:{s}")

    def add_command(self, *, client_id: str, action: str, payload: dict | None = None, now_ms: int | None = None) -> int:
        cid = str(client_id or "").strip()
        act = str(action or "").strip().lower()
        if not cid or not act:
            return 0
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        if payload is not None and not isinstance(payload, dict):
            raise ValueError("invalid_payload")
        p = payload or {}
        now_ms = self._parse_int(now_ms, error="invalid_now_ms")
        payload_json = json.dumps(p, ensure_ascii=False, separators=(",", ":"))

        with self._lock:
            conn = self._connect()
            try:
                self._ensure_state_row(conn=conn, client_id=cid, now_ms=now_ms)

                if act == "pause":
                    conn.execute(
                        "UPDATE tour_control_state SET status = 'paused', paused = 1, updated_at_ms = ? WHERE client_id = ?",
                        (now_ms, cid),
                    )
                elif act == "resume":
                    conn.execute(
                        "UPDATE tour_control_state SET status = 'playing', paused = 0, updated_at_ms = ? WHERE client_id = ?",
                        (now_ms, cid),
                    )
                elif act == "speed":
                    s = self._parse_float(p.get("speed"), error="invalid_speed")
                    s = max(0.5, min(s, 3.0))
                    conn.execute(
                        "UPDATE tour_control_state SET speed = ?, updated_at_ms = ? WHERE client_id = ?",
                        (float(s), now_ms, cid),
                    )
                elif act in ("restart", "skip", "next", "prev", "jump", "go"):
                    conn.execute(
                        "UPDATE tour_control_state SET status = 'playing', paused = 0, updated_at_ms = ? WHERE client_id = ?",
                        (now_ms, cid),
                    )
                elif act in ("reset", "stop"):
                    conn.execute(
                        "UPDATE tour_control_state SET status = 'waiting', paused = 0, updated_at_ms = ? WHERE client_id = ?",
                        (now_ms, cid),
                    )

                cur = conn.execute(
                    """
                    INSERT INTO tour_control_commands (client_id, action, payload_json, created_at_ms, consumed_at_ms)
                    VALUES (?, ?, ?, ?, NULL)
                    """,
                    (cid, act, payload_json, now_ms),
                )
                conn.commit()
                return int(cur.lastrowid or 0)
            finally:
                conn.close()

    def list_commands(self, *, client_id: str, since_id: int = 0, limit: int = 50) -> list[TourControlCommand]:
        cid = str(client_id or "").strip()
        if not cid:
            return []
        since_id = max(0, self._parse_int(since_id, error="invalid_since_id"))
        limit = max(1, min(self._parse_int(limit, error="invalid_limit"), 200))
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT id, client_id, action, payload_json, created_at_ms, consumed_at_ms
                    FROM tour_control_commands
                    WHERE client_id = ? AND id > ?
                    ORDER BY id ASC
                    LIMIT ?
                    """,
                    (cid, since_id, limit),
                ).fetchall()
                out: list[TourControlCommand] = []
                for r in rows:
                    command_id = self._parse_int(r["id"], error="invalid tour_control_commands.id")
                    row_client_id = str(r["client_id"] or cid)
                    payload = self._parse_payload_json(r["payload_json"], command_id=command_id, client_id=row_client_id)
                    consumed_at_ms = (
                        self._parse_int(r["consumed_at_ms"], error="invalid tour_control_commands.consumed_at_ms")
                        if r["consumed_at_ms"] is not None
                        else None
                    )
                    out.append(
                        TourControlCommand(
                            id=command_id,
                            client_id=row_client_id,
                            action=str(r["action"] or ""),
                            payload=payload,
                            created_at_ms=self._parse_int(
                                r["created_at_ms"],
                                error="invalid tour_control_commands.created_at_ms",
                            ),
                            consumed_at_ms=consumed_at_ms,
                        )
                    )
                return out
            finally:
                conn.close()

    def consume(self, *, client_id: str, command_id: int, now_ms: int | None = None) -> bool:
        cid = str(client_id or "").strip()
        if not cid:
            return False
        command_id = self._parse_int(command_id, error="invalid_command_id")
        if command_id <= 0:
            raise ValueError("invalid_command_id")
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        now_ms = self._parse_int(now_ms, error="invalid_now_ms")

        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """
                    UPDATE tour_control_commands
                    SET consumed_at_ms = ?
                    WHERE id = ? AND client_id = ? AND consumed_at_ms IS NULL
                    """,
                    (now_ms, command_id, cid),
                )
                conn.commit()
                return int(cur.rowcount or 0) > 0
            finally:
                conn.close()
