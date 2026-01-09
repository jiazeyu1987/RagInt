from __future__ import annotations

import json
import secrets
import hashlib
import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Device:
    device_id: str
    name: str
    model: str
    version: str
    last_seen_at_ms: int
    meta: dict


@dataclass(frozen=True)
class DeviceConfig:
    device_id: str
    config_version: int
    config: dict
    updated_at_ms: int


@dataclass(frozen=True)
class AuditEvent:
    id: int
    ts_ms: int
    actor_kind: str
    actor_id: str
    action: str
    target_kind: str
    target_id: str
    payload: dict


class OpsStore:
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
                    CREATE TABLE IF NOT EXISTS devices (
                        device_id TEXT PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT '',
                        model TEXT NOT NULL DEFAULT '',
                        version TEXT NOT NULL DEFAULT '',
                        meta_json TEXT NOT NULL DEFAULT '{}',
                        last_seen_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at_ms DESC);")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS device_configs (
                        device_id TEXT PRIMARY KEY,
                        config_version INTEGER NOT NULL DEFAULT 0,
                        config_json TEXT NOT NULL DEFAULT '{}',
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS ops_audit (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ts_ms INTEGER NOT NULL,
                        actor_kind TEXT NOT NULL,
                        actor_id TEXT NOT NULL,
                        action TEXT NOT NULL,
                        target_kind TEXT NOT NULL,
                        target_id TEXT NOT NULL,
                        payload_json TEXT NOT NULL DEFAULT '{}'
                    );
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_ops_audit_ts ON ops_audit(ts_ms DESC, id DESC);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_ops_audit_target ON ops_audit(target_kind, target_id, ts_ms DESC);")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS device_tokens (
                        device_id TEXT PRIMARY KEY,
                        token_sha256 TEXT NOT NULL,
                        issued_at_ms INTEGER NOT NULL,
                        revoked_at_ms INTEGER
                    );
                    """
                )
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _sha256(s: str) -> str:
        return hashlib.sha256(str(s or "").encode("utf-8")).hexdigest()

    def issue_device_token(self, *, device_id: str, now_ms: int | None = None) -> str | None:
        did = str(device_id or "").strip()
        if not did:
            return None
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        token = secrets.token_urlsafe(24)
        token_sha = self._sha256(token)
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO device_tokens (device_id, token_sha256, issued_at_ms, revoked_at_ms)
                    VALUES (?, ?, ?, NULL)
                    ON CONFLICT(device_id) DO UPDATE SET
                        token_sha256 = excluded.token_sha256,
                        issued_at_ms = excluded.issued_at_ms,
                        revoked_at_ms = NULL
                    """,
                    (did, token_sha, int(now_ms)),
                )
                conn.commit()
                return token
            finally:
                conn.close()

    def verify_device_token(self, *, device_id: str, token: str | None) -> bool:
        did = str(device_id or "").strip()
        tok = str(token or "").strip()
        if not did or not tok:
            return False
        tok_sha = self._sha256(tok)
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT token_sha256, revoked_at_ms FROM device_tokens WHERE device_id = ?",
                    (did,),
                ).fetchone()
                if not row:
                    return False
                if row["revoked_at_ms"] is not None:
                    return False
                return str(row["token_sha256"] or "") == tok_sha
            finally:
                conn.close()

    def revoke_device_token(self, *, device_id: str, now_ms: int | None = None) -> bool:
        did = str(device_id or "").strip()
        if not did:
            return False
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    "UPDATE device_tokens SET revoked_at_ms = ? WHERE device_id = ? AND revoked_at_ms IS NULL",
                    (int(now_ms), did),
                )
                conn.commit()
                return int(cur.rowcount or 0) > 0
            finally:
                conn.close()

    def audit(
        self,
        *,
        actor_kind: str,
        actor_id: str,
        action: str,
        target_kind: str,
        target_id: str,
        payload: dict | None = None,
        ts_ms: int | None = None,
    ) -> int:
        ak = str(actor_kind or "").strip().lower() or "unknown"
        aid = str(actor_id or "").strip() or "-"
        act = str(action or "").strip().lower() or "event"
        tk = str(target_kind or "").strip().lower() or "unknown"
        tid = str(target_id or "").strip() or "-"
        p = payload if isinstance(payload, dict) else {}
        if ts_ms is None:
            ts_ms = int(time.time() * 1000)

        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """
                    INSERT INTO ops_audit (ts_ms, actor_kind, actor_id, action, target_kind, target_id, payload_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (int(ts_ms), ak, aid, act, tk, tid, json.dumps(p, ensure_ascii=False, separators=(",", ":"))),
                )
                conn.commit()
                return int(cur.lastrowid or 0)
            finally:
                conn.close()

    def list_audit(
        self,
        *,
        limit: int = 200,
        target_kind: str | None = None,
        target_id: str | None = None,
    ) -> list[AuditEvent]:
        limit = max(1, min(int(limit or 200), 500))
        tk = str(target_kind or "").strip().lower() if target_kind else None
        tid = str(target_id or "").strip() if target_id else None
        with self._lock:
            conn = self._connect()
            try:
                where = []
                params: list[object] = []
                if tk:
                    where.append("target_kind = ?")
                    params.append(tk)
                if tid:
                    where.append("target_id = ?")
                    params.append(tid)
                sql = (
                    "SELECT id, ts_ms, actor_kind, actor_id, action, target_kind, target_id, payload_json FROM ops_audit"
                    + ((" WHERE " + " AND ".join(where)) if where else "")
                    + " ORDER BY ts_ms DESC, id DESC LIMIT ?"
                )
                rows = conn.execute(sql, tuple(params + [limit])).fetchall()
                out: list[AuditEvent] = []
                for r in rows:
                    try:
                        payload = json.loads(str(r["payload_json"] or "{}"))
                    except Exception:
                        payload = {}
                    if not isinstance(payload, dict):
                        payload = {}
                    out.append(
                        AuditEvent(
                            id=int(r["id"] or 0),
                            ts_ms=int(r["ts_ms"] or 0),
                            actor_kind=str(r["actor_kind"] or ""),
                            actor_id=str(r["actor_id"] or ""),
                            action=str(r["action"] or ""),
                            target_kind=str(r["target_kind"] or ""),
                            target_id=str(r["target_id"] or ""),
                            payload=payload,
                        )
                    )
                return out
            finally:
                conn.close()

    def heartbeat(
        self,
        *,
        device_id: str,
        name: str | None = None,
        model: str | None = None,
        version: str | None = None,
        meta: dict | None = None,
        now_ms: int | None = None,
    ) -> bool:
        did = str(device_id or "").strip()
        if not did:
            return False
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        nm = str(name or "").strip()
        md = str(model or "").strip()
        ver = str(version or "").strip()
        m = meta if isinstance(meta, dict) else {}
        meta_json = json.dumps(m, ensure_ascii=False, separators=(",", ":"))
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO devices (device_id, name, model, version, meta_json, last_seen_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(device_id) DO UPDATE SET
                        name = excluded.name,
                        model = excluded.model,
                        version = excluded.version,
                        meta_json = excluded.meta_json,
                        last_seen_at_ms = excluded.last_seen_at_ms
                    """,
                    (did, nm, md, ver, meta_json, int(now_ms)),
                )
                conn.commit()
                return True
            finally:
                conn.close()

    def list_devices(self, *, limit: int = 100) -> list[Device]:
        limit = max(1, min(int(limit or 100), 500))
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT device_id, name, model, version, meta_json, last_seen_at_ms
                    FROM devices
                    ORDER BY last_seen_at_ms DESC, device_id ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                out: list[Device] = []
                for r in rows:
                    try:
                        meta = json.loads(str(r["meta_json"] or "{}"))
                    except Exception:
                        meta = {}
                    if not isinstance(meta, dict):
                        meta = {}
                    out.append(
                        Device(
                            device_id=str(r["device_id"] or ""),
                            name=str(r["name"] or ""),
                            model=str(r["model"] or ""),
                            version=str(r["version"] or ""),
                            last_seen_at_ms=int(r["last_seen_at_ms"] or 0),
                            meta=meta,
                        )
                    )
                return out
            finally:
                conn.close()

    def set_config(self, *, device_id: str, config: dict, now_ms: int | None = None) -> DeviceConfig | None:
        did = str(device_id or "").strip()
        if not did:
            return None
        cfg = config if isinstance(config, dict) else {}
        if now_ms is None:
            now_ms = int(time.time() * 1000)
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT config_version FROM device_configs WHERE device_id = ?",
                    (did,),
                ).fetchone()
                cur_ver = int((row["config_version"] if row else 0) or 0)
                next_ver = cur_ver + 1
                conn.execute(
                    """
                    INSERT INTO device_configs (device_id, config_version, config_json, updated_at_ms)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(device_id) DO UPDATE SET
                        config_version = excluded.config_version,
                        config_json = excluded.config_json,
                        updated_at_ms = excluded.updated_at_ms
                    """,
                    (did, int(next_ver), json.dumps(cfg, ensure_ascii=False, separators=(",", ":")), int(now_ms)),
                )
                conn.commit()
                return DeviceConfig(device_id=did, config_version=int(next_ver), config=cfg, updated_at_ms=int(now_ms))
            finally:
                conn.close()

    def get_config(self, *, device_id: str) -> DeviceConfig | None:
        did = str(device_id or "").strip()
        if not did:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT device_id, config_version, config_json, updated_at_ms FROM device_configs WHERE device_id = ?",
                    (did,),
                ).fetchone()
                if not row:
                    return None
                try:
                    cfg = json.loads(str(row["config_json"] or "{}"))
                except Exception:
                    cfg = {}
                if not isinstance(cfg, dict):
                    cfg = {}
                return DeviceConfig(
                    device_id=str(row["device_id"] or did),
                    config_version=int(row["config_version"] or 0),
                    config=cfg,
                    updated_at_ms=int(row["updated_at_ms"] or 0),
                )
            finally:
                conn.close()
