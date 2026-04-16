from __future__ import annotations

import logging
import os
import shutil
import sqlite3
import threading
import time
import uuid
from pathlib import Path


def _safe_path_part(value: str, *, fallback: str = "item") -> str:
    text = str(value or "").strip()
    if not text:
        text = fallback
    out = []
    for ch in text:
        if ch.isalnum() or ch in {"-", "_", "."}:
            out.append(ch)
        else:
            out.append("_")
    normalized = "".join(out).strip("._")
    return normalized or fallback


def _normalize_rel_path(value: str) -> str:
    rel = str(value or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise ValueError("bad_path")
    return rel


def _normalize_hotspot_measure(value, *, field_name: str) -> float:
    try:
        out = float(value)
    except Exception as exc:  # pragma: no cover - defensive conversion.
        raise ValueError(f"{field_name}_invalid") from exc
    if out < 0 or out > 1:
        raise ValueError(f"{field_name}_invalid")
    return round(out, 6)


def _normalize_hotspot_geometry(*, x_pct, y_pct, width_pct, height_pct) -> tuple[float, float, float, float]:
    x_value = _normalize_hotspot_measure(x_pct, field_name="x_pct")
    y_value = _normalize_hotspot_measure(y_pct, field_name="y_pct")
    width_value = _normalize_hotspot_measure(width_pct, field_name="width_pct")
    height_value = _normalize_hotspot_measure(height_pct, field_name="height_pct")
    if width_value <= 0:
        raise ValueError("width_pct_invalid")
    if height_value <= 0:
        raise ValueError("height_pct_invalid")
    if x_value + width_value > 1.000001:
        raise ValueError("hotspot_bounds_invalid")
    if y_value + height_value > 1.000001:
        raise ValueError("hotspot_bounds_invalid")
    return x_value, y_value, width_value, height_value


def _normalize_station_id(value: str) -> str:
    station_id = str(value or "").strip().lower()
    if not station_id:
        raise ValueError("station_id_required")
    out = []
    for ch in station_id:
        if ch.isalnum() or ch in {"-", "_", "."}:
            out.append(ch)
        else:
            out.append("_")
    normalized = "".join(out).strip("._")
    if not normalized:
        raise ValueError("station_id_invalid")
    return normalized


def _normalize_station_key(value: str) -> str:
    return _normalize_station_id(value)


class PadProductStore:
    def __init__(self, db_path: Path, audio_root: Path, image_root: Path, *, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._db_path = Path(db_path)
        self._audio_root = Path(audio_root)
        self._image_root = Path(image_root)
        self._lock = threading.Lock()
        self._ensure_db()

    def _connect(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._audio_root.mkdir(parents=True, exist_ok=True)
        self._image_root.mkdir(parents=True, exist_ok=True)
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
                    CREATE TABLE IF NOT EXISTS pad_hall_bindings (
                        client_id TEXT PRIMARY KEY,
                        hall_id TEXT NOT NULL,
                        hall_name TEXT NOT NULL,
                        enabled INTEGER NOT NULL DEFAULT 1,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_display_bindings (
                        client_id TEXT PRIMARY KEY,
                        display_id TEXT NOT NULL,
                        display_name TEXT NOT NULL,
                        hall_id TEXT NOT NULL,
                        hall_name TEXT NOT NULL,
                        slot_1_station_id TEXT NOT NULL,
                        slot_2_station_id TEXT NOT NULL,
                        enabled INTEGER NOT NULL DEFAULT 1,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_hall_stations (
                        hall_id TEXT NOT NULL,
                        station_id TEXT NOT NULL,
                        label TEXT NOT NULL DEFAULT '',
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL,
                        PRIMARY KEY (hall_id, station_id)
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_hall_stations_hall_sort ON pad_hall_stations(hall_id, sort_order, station_id);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS hall_products (
                        product_id TEXT PRIMARY KEY,
                        hall_id TEXT NOT NULL,
                        sort_order INTEGER NOT NULL,
                        product_name TEXT NOT NULL,
                        product_name_en TEXT NOT NULL,
                        intro_text TEXT NOT NULL,
                        registration_name TEXT NOT NULL,
                        registration_number TEXT NOT NULL,
                        effective_date TEXT NOT NULL,
                        company TEXT NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_hall_products_hall_sort ON hall_products(hall_id, sort_order, product_id);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS product_audio_assets (
                        audio_asset_id TEXT PRIMARY KEY,
                        product_id TEXT NOT NULL,
                        source_type TEXT NOT NULL,
                        text_snapshot TEXT NOT NULL,
                        rel_path TEXT NOT NULL,
                        mimetype TEXT NOT NULL,
                        is_active INTEGER NOT NULL DEFAULT 0,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_product_audio_assets_product ON product_audio_assets(product_id, created_at_ms DESC);"
                )
                conn.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_product_audio_assets_active_product ON product_audio_assets(product_id) WHERE is_active = 1;"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS product_image_assets (
                        image_asset_id TEXT PRIMARY KEY,
                        product_id TEXT NOT NULL,
                        rel_path TEXT NOT NULL,
                        mimetype TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_product_image_assets_product ON product_image_assets(product_id, created_at_ms DESC, image_asset_id DESC);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_hall_scenes (
                        scene_id TEXT PRIMARY KEY,
                        hall_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        background_rel_path TEXT NOT NULL,
                        background_mimetype TEXT NOT NULL,
                        base_width INTEGER NOT NULL DEFAULT 0,
                        base_height INTEGER NOT NULL DEFAULT 0,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_hall_scenes_hall_sort ON pad_hall_scenes(hall_id, sort_order, scene_id);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_hall_scene_hotspots (
                        hotspot_id TEXT PRIMARY KEY,
                        scene_id TEXT NOT NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        x_pct REAL NOT NULL,
                        y_pct REAL NOT NULL,
                        width_pct REAL NOT NULL,
                        height_pct REAL NOT NULL,
                        title TEXT NOT NULL,
                        content_text TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_hall_scene_hotspots_scene_sort ON pad_hall_scene_hotspots(scene_id, sort_order, hotspot_id);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_hall_station_configs (
                        hall_id TEXT NOT NULL,
                        station_key TEXT NOT NULL,
                        label TEXT NOT NULL DEFAULT '',
                        recording_id TEXT NOT NULL DEFAULT '',
                        stop_index INTEGER,
                        stop_name TEXT NOT NULL DEFAULT '',
                        background_rel_path TEXT NOT NULL DEFAULT '',
                        background_mimetype TEXT NOT NULL DEFAULT '',
                        wireframe_rel_path TEXT NOT NULL DEFAULT '',
                        wireframe_mimetype TEXT NOT NULL DEFAULT '',
                        base_width INTEGER NOT NULL DEFAULT 0,
                        base_height INTEGER NOT NULL DEFAULT 0,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL,
                        PRIMARY KEY (hall_id, station_key)
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_hall_station_configs_hall ON pad_hall_station_configs(hall_id, station_key);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_hall_station_hotspots (
                        hotspot_id TEXT PRIMARY KEY,
                        hall_id TEXT NOT NULL,
                        station_key TEXT NOT NULL,
                        product_id TEXT NOT NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        x_pct REAL NOT NULL,
                        y_pct REAL NOT NULL,
                        width_pct REAL NOT NULL,
                        height_pct REAL NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_hall_station_hotspots_station ON pad_hall_station_hotspots(hall_id, station_key, sort_order, hotspot_id);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_station_narration_timeline_events (
                        event_id TEXT PRIMARY KEY,
                        hall_id TEXT NOT NULL,
                        station_id TEXT NOT NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        time_ms INTEGER NOT NULL,
                        product_id TEXT NOT NULL,
                        station_hotspot_id TEXT NOT NULL,
                        event_type TEXT NOT NULL DEFAULT 'focus_switch',
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_station_narration_timeline_events_station ON pad_station_narration_timeline_events(hall_id, station_id, sort_order, time_ms, event_id);"
                )
                conn.commit()
            finally:
                conn.close()

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def audio_root(self) -> Path:
        self._audio_root.mkdir(parents=True, exist_ok=True)
        return self._audio_root

    def image_root(self) -> Path:
        self._image_root.mkdir(parents=True, exist_ok=True)
        return self._image_root

    def product_audio_dir(self, product_id: str) -> Path:
        pid = _safe_path_part(product_id, fallback="product")
        target = (self.audio_root() / pid).resolve()
        base = self.audio_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_audio_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def product_image_dir(self, product_id: str) -> Path:
        pid = _safe_path_part(product_id, fallback="product")
        target = (self.image_root() / pid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def scene_background_dir(self, *, hall_id: str, scene_id: str) -> Path:
        hid = _safe_path_part(hall_id, fallback="hall")
        sid = _safe_path_part(scene_id, fallback="scene")
        target = (self.image_root() / "scenes" / hid / sid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def station_asset_dir(self, *, hall_id: str, station_key: str) -> Path:
        hid = _safe_path_part(hall_id, fallback="hall")
        skey = _safe_path_part(_normalize_station_key(station_key), fallback="station")
        target = (self.image_root() / "stations" / hid / skey).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def build_audio_rel_path(self, *, product_id: str, filename: str) -> str:
        pid = _safe_path_part(product_id, fallback="product")
        fname = str(filename or "").replace("\\", "/").lstrip("/")
        if not fname or ".." in fname.split("/"):
            raise ValueError("bad_filename")
        return f"{pid}/{fname}"

    def build_image_rel_path(self, *, product_id: str, filename: str) -> str:
        pid = _safe_path_part(product_id, fallback="product")
        fname = str(filename or "").replace("\\", "/").lstrip("/")
        if not fname or ".." in fname.split("/"):
            raise ValueError("bad_filename")
        return f"{pid}/{fname}"

    def build_scene_background_rel_path(self, *, hall_id: str, scene_id: str, filename: str) -> str:
        hid = _safe_path_part(hall_id, fallback="hall")
        sid = _safe_path_part(scene_id, fallback="scene")
        fname = str(filename or "").replace("\\", "/").lstrip("/")
        if not fname or ".." in fname.split("/"):
            raise ValueError("bad_filename")
        return f"scenes/{hid}/{sid}/{fname}"

    def build_station_asset_rel_path(self, *, hall_id: str, station_key: str, filename: str) -> str:
        hid = _safe_path_part(hall_id, fallback="hall")
        skey = _safe_path_part(_normalize_station_key(station_key), fallback="station")
        fname = str(filename or "").replace("\\", "/").lstrip("/")
        if not fname or ".." in fname.split("/"):
            raise ValueError("bad_filename")
        return f"stations/{hid}/{skey}/{fname}"

    def resolve_audio_rel_path(self, rel_path: str) -> Path:
        rel = _normalize_rel_path(rel_path)
        target = (self.audio_root() / rel).resolve()
        base = self.audio_root().resolve()
        if str(target).lower().startswith(str(base).lower() + os.sep.lower()) or str(target).lower() == str(base).lower():
            return target
        raise ValueError("path_outside_audio_root")

    def resolve_image_rel_path(self, rel_path: str) -> Path:
        rel = _normalize_rel_path(rel_path)
        target = (self.image_root() / rel).resolve()
        base = self.image_root().resolve()
        if str(target).lower().startswith(str(base).lower() + os.sep.lower()) or str(target).lower() == str(base).lower():
            return target
        raise ValueError("path_outside_image_root")

    def delete_product_audio_dir(self, product_id: str) -> None:
        pid = _safe_path_part(product_id, fallback="product")
        target = (self.audio_root() / pid).resolve()
        base = self.audio_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            return
        try:
            if target.exists() and target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
        except Exception:
            pass

    def delete_product_image_dir(self, product_id: str) -> None:
        pid = _safe_path_part(product_id, fallback="product")
        target = (self.image_root() / pid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            return
        try:
            if target.exists() and target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
        except Exception:
            pass

    def delete_scene_background_dir(self, *, hall_id: str, scene_id: str) -> None:
        hid = _safe_path_part(hall_id, fallback="hall")
        sid = _safe_path_part(scene_id, fallback="scene")
        target = (self.image_root() / "scenes" / hid / sid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            return
        try:
            if target.exists() and target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
        except Exception:
            pass

    def delete_station_asset_dir(self, *, hall_id: str, station_key: str) -> None:
        hid = _safe_path_part(hall_id, fallback="hall")
        skey = _safe_path_part(_normalize_station_key(station_key), fallback="station")
        target = (self.image_root() / "stations" / hid / skey).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            return
        try:
            if target.exists() and target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
        except Exception:
            pass

    def delete_image_rel_path(self, rel_path: str) -> None:
        try:
            target = self.resolve_image_rel_path(rel_path)
        except Exception:
            return
        try:
            if target.exists() and target.is_file():
                target.unlink()
        except Exception:
            pass

    def upsert_display_binding(
        self,
        *,
        client_id: str,
        hall_id: str,
        hall_name: str,
        display_id: str | None = None,
        display_name: str | None = None,
        slot_1_station_id: str | None = None,
        slot_2_station_id: str | None = None,
        enabled: bool = True,
    ) -> dict:
        cid = str(client_id or "").strip()
        hid = str(hall_id or "").strip()
        hname = str(hall_name or "").strip()
        if not cid:
            raise ValueError("client_id_required")
        if not hid:
            raise ValueError("hall_id_required")
        if not hname:
            raise ValueError("hall_name_required")
        did = str(display_id or cid).strip() or cid
        dname = str(display_name or did).strip() or did
        slot1 = _normalize_station_id(slot_1_station_id or "station_a")
        slot2 = _normalize_station_id(slot_2_station_id or "station_b")
        if slot1 == slot2:
            raise ValueError("display_station_ids_must_be_distinct")
        if not self.get_hall_station(hall_id=hid, station_id=slot1):
            self.upsert_hall_station(hall_id=hid, station_id=slot1, label=slot1, sort_order=0)
        if not self.get_hall_station(hall_id=hid, station_id=slot2):
            self.upsert_hall_station(hall_id=hid, station_id=slot2, label=slot2, sort_order=1)
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO pad_display_bindings (
                        client_id, display_id, display_name, hall_id, hall_name,
                        slot_1_station_id, slot_2_station_id, enabled, updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(client_id) DO UPDATE SET
                      display_id=excluded.display_id,
                      display_name=excluded.display_name,
                      hall_id=excluded.hall_id,
                      hall_name=excluded.hall_name,
                      slot_1_station_id=excluded.slot_1_station_id,
                      slot_2_station_id=excluded.slot_2_station_id,
                      enabled=excluded.enabled,
                      updated_at_ms=excluded.updated_at_ms
                    """,
                    (cid, did, dname, hid, hname, slot1, slot2, 1 if enabled else 0, int(now_ms)),
                )
                conn.execute(
                    """
                    INSERT INTO pad_hall_bindings (client_id, hall_id, hall_name, enabled, updated_at_ms)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(client_id) DO UPDATE SET
                      hall_id=excluded.hall_id,
                      hall_name=excluded.hall_name,
                      enabled=excluded.enabled,
                      updated_at_ms=excluded.updated_at_ms
                    """,
                    (cid, hid, hname, 1 if enabled else 0, int(now_ms)),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_display_binding(cid, enabled_only=False) or {}

    def get_display_binding(self, client_id: str, *, enabled_only: bool = True) -> dict | None:
        cid = str(client_id or "").strip()
        if not cid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                sql = """
                    SELECT
                      client_id,
                      display_id,
                      display_name,
                      hall_id,
                      hall_name,
                      slot_1_station_id,
                      slot_2_station_id,
                      enabled,
                      updated_at_ms
                    FROM pad_display_bindings
                    WHERE client_id=?
                """
                if enabled_only:
                    sql += " AND enabled=1"
                row = conn.execute(sql, (cid,)).fetchone()
                if row:
                    return dict(row)
            finally:
                conn.close()
        legacy = self.get_binding(cid, enabled_only=enabled_only)
        if not legacy:
            return None
        return {
            "client_id": str(legacy.get("client_id") or cid),
            "display_id": str(legacy.get("client_id") or cid),
            "display_name": str(legacy.get("client_id") or cid),
            "hall_id": str(legacy.get("hall_id") or ""),
            "hall_name": str(legacy.get("hall_name") or ""),
            "slot_1_station_id": "station_a",
            "slot_2_station_id": "station_b",
            "enabled": int(legacy.get("enabled") or 0),
            "updated_at_ms": int(legacy.get("updated_at_ms") or 0),
        }

    def list_display_bindings(self, *, enabled_only: bool = False) -> list[dict]:
        with self._lock:
            conn = self._connect()
            try:
                sql = """
                    SELECT
                      client_id,
                      display_id,
                      display_name,
                      hall_id,
                      hall_name,
                      slot_1_station_id,
                      slot_2_station_id,
                      enabled,
                      updated_at_ms
                    FROM pad_display_bindings
                """
                if enabled_only:
                    sql += " WHERE enabled=1"
                sql += " ORDER BY hall_id ASC, display_id ASC, client_id ASC"
                rows = [dict(row) for row in conn.execute(sql).fetchall()]
            finally:
                conn.close()
        if rows:
            return rows
        return [
            {
                "client_id": str(item.get("client_id") or ""),
                "display_id": str(item.get("client_id") or ""),
                "display_name": str(item.get("client_id") or ""),
                "hall_id": str(item.get("hall_id") or ""),
                "hall_name": str(item.get("hall_name") or ""),
                "slot_1_station_id": "station_a",
                "slot_2_station_id": "station_b",
                "enabled": int(item.get("enabled") or 0),
                "updated_at_ms": int(item.get("updated_at_ms") or 0),
            }
            for item in self.list_bindings(enabled_only=enabled_only)
        ]

    def upsert_hall_binding(self, *, client_id: str, hall_id: str, hall_name: str, enabled: bool = True) -> dict:
        cid = str(client_id or "").strip()
        hid = str(hall_id or "").strip()
        hname = str(hall_name or "").strip()
        if not cid:
            raise ValueError("client_id_required")
        if not hid:
            raise ValueError("hall_id_required")
        if not hname:
            raise ValueError("hall_name_required")
        self.upsert_display_binding(
            client_id=cid,
            hall_id=hid,
            hall_name=hname,
            display_id=cid,
            display_name=cid,
            slot_1_station_id="station_a",
            slot_2_station_id="station_b",
            enabled=enabled,
        )
        return self.get_binding(cid, enabled_only=False) or {}

    def get_binding(self, client_id: str, *, enabled_only: bool = True) -> dict | None:
        cid = str(client_id or "").strip()
        if not cid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                sql = """
                    SELECT client_id, hall_id, hall_name, enabled, updated_at_ms
                    FROM pad_hall_bindings
                    WHERE client_id=?
                """
                if enabled_only:
                    sql += " AND enabled=1"
                row = conn.execute(sql, (cid,)).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def list_bindings(self, *, enabled_only: bool = False) -> list[dict]:
        with self._lock:
            conn = self._connect()
            try:
                sql = """
                    SELECT client_id, hall_id, hall_name, enabled, updated_at_ms
                    FROM pad_hall_bindings
                """
                if enabled_only:
                    sql += " WHERE enabled=1"
                sql += " ORDER BY hall_id ASC, client_id ASC"
                return [dict(row) for row in conn.execute(sql).fetchall()]
            finally:
                conn.close()

    def upsert_hall_station(self, *, hall_id: str, station_id: str, label: str, sort_order: int = 0) -> dict:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            raise ValueError("hall_id_required")
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO pad_hall_stations (hall_id, station_id, label, sort_order, created_at_ms, updated_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hall_id, station_id) DO UPDATE SET
                      label=excluded.label,
                      sort_order=excluded.sort_order,
                      updated_at_ms=excluded.updated_at_ms
                    """,
                    (hid, sid, str(label or "").strip(), int(sort_order or 0), int(now_ms), int(now_ms)),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_hall_station(hall_id=hid, station_id=sid) or {}

    def get_hall_station(self, *, hall_id: str, station_id: str) -> dict | None:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT hall_id, station_id, label, sort_order, created_at_ms, updated_at_ms
                    FROM pad_hall_stations
                    WHERE hall_id=? AND station_id=?
                    LIMIT 1
                    """,
                    (hid, sid),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def list_hall_stations(self, *, hall_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        if not hid:
            return []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT hall_id, station_id, label, sort_order, created_at_ms, updated_at_ms
                    FROM pad_hall_stations
                    WHERE hall_id=?
                    ORDER BY sort_order ASC, station_id ASC
                    """,
                    (hid,),
                ).fetchall()
            finally:
                conn.close()
        items = [dict(row) for row in rows]
        if items:
            return items
        fallback_ids = []
        for station_id in ("station_a", "station_b"):
            station = self.get_station_config(hall_id=hid, station_key=station_id)
            if station and (
                str(station.get("label") or "").strip()
                or str(station.get("recording_id") or "").strip()
                or str(station.get("background_rel_path") or "").strip()
                or str(station.get("wireframe_rel_path") or "").strip()
                or self.list_station_hotspots(hall_id=hid, station_key=station_id)
            ):
                fallback_ids.append(
                    {
                        "hall_id": hid,
                        "station_id": station_id,
                        "label": str(station.get("label") or "").strip(),
                        "sort_order": len(fallback_ids),
                        "created_at_ms": int(station.get("created_at_ms") or 0),
                        "updated_at_ms": int(station.get("updated_at_ms") or 0),
                    }
                )
        return fallback_ids

    def resolve_display_station_ids(self, *, client_id: str) -> list[tuple[str, str]]:
        binding = self.get_display_binding(client_id, enabled_only=True)
        if not binding:
            return []
        return [
            ("display_slot_1", _normalize_station_id(binding.get("slot_1_station_id") or "station_a")),
            ("display_slot_2", _normalize_station_id(binding.get("slot_2_station_id") or "station_b")),
        ]

    def replace_hall_products(self, *, hall_id: str, products: list[dict]) -> dict:
        hid = str(hall_id or "").strip()
        if not hid:
            raise ValueError("hall_id_required")
        if not isinstance(products, list):
            raise ValueError("products_must_be_list")

        keep_ids: list[str] = []
        normalized_products: list[dict] = []
        now_ms = self._now_ms()
        for raw in products:
            item = raw if isinstance(raw, dict) else {}
            product_id = str(item.get("product_id") or "").strip()
            if not product_id:
                raise ValueError("product_id_required")
            keep_ids.append(product_id)
            normalized_products.append(
                {
                    "product_id": product_id,
                    "hall_id": hid,
                    "sort_order": int(item.get("sort_order") or 0),
                    "product_name": str(item.get("product_name") or "").strip(),
                    "product_name_en": str(item.get("product_name_en") or "").strip(),
                    "intro_text": str(item.get("intro_text") or "").strip(),
                    "registration_name": str(item.get("registration_name") or "").strip(),
                    "registration_number": str(item.get("registration_number") or "").strip(),
                    "effective_date": str(item.get("effective_date") or "").strip(),
                    "company": str(item.get("company") or "").strip(),
                    "updated_at_ms": int(item.get("updated_at_ms") or now_ms),
                }
            )

        deleted_ids: list[str] = []
        with self._lock:
            conn = self._connect()
            try:
                existing_rows = conn.execute("SELECT product_id FROM hall_products WHERE hall_id=?", (hid,)).fetchall()
                existing_ids = [str(row["product_id"]) for row in existing_rows]
                deleted_ids = [pid for pid in existing_ids if pid not in keep_ids]

                for product in normalized_products:
                    conn.execute(
                        """
                        INSERT INTO hall_products (
                            product_id,
                            hall_id,
                            sort_order,
                            product_name,
                            product_name_en,
                            intro_text,
                            registration_name,
                            registration_number,
                            effective_date,
                            company,
                            updated_at_ms
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(product_id) DO UPDATE SET
                          hall_id=excluded.hall_id,
                          sort_order=excluded.sort_order,
                          product_name=excluded.product_name,
                          product_name_en=excluded.product_name_en,
                          intro_text=excluded.intro_text,
                          registration_name=excluded.registration_name,
                          registration_number=excluded.registration_number,
                          effective_date=excluded.effective_date,
                          company=excluded.company,
                          updated_at_ms=excluded.updated_at_ms
                        """,
                        (
                            product["product_id"],
                            product["hall_id"],
                            int(product["sort_order"]),
                            product["product_name"],
                            product["product_name_en"],
                            product["intro_text"],
                            product["registration_name"],
                            product["registration_number"],
                            product["effective_date"],
                            product["company"],
                            int(product["updated_at_ms"]),
                        ),
                    )

                if deleted_ids:
                    placeholders = ", ".join(["?"] * len(deleted_ids))
                    conn.execute(
                        f"DELETE FROM product_audio_assets WHERE product_id IN ({placeholders})",
                        tuple(deleted_ids),
                    )
                    conn.execute(
                        f"DELETE FROM product_image_assets WHERE product_id IN ({placeholders})",
                        tuple(deleted_ids),
                    )
                    conn.execute(
                        f"DELETE FROM hall_products WHERE product_id IN ({placeholders})",
                        tuple(deleted_ids),
                    )
                conn.commit()
            finally:
                conn.close()

        for product_id in deleted_ids:
            self.delete_product_audio_dir(product_id)
            self.delete_product_image_dir(product_id)

        return {
            "hall_id": hid,
            "imported_count": len(normalized_products),
            "deleted_count": len(deleted_ids),
            "product_ids": keep_ids,
        }

    def get_product(self, product_id: str) -> dict | None:
        pid = str(product_id or "").strip()
        if not pid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT product_id, hall_id, sort_order, product_name, product_name_en, intro_text,
                           registration_name, registration_number, effective_date, company, updated_at_ms
                    FROM hall_products
                    WHERE product_id=?
                    """,
                    (pid,),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def list_hall_products(self, hall_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        if not hid:
            return []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT
                      p.product_id,
                      p.hall_id,
                      p.sort_order,
                      p.product_name,
                      p.product_name_en,
                      p.intro_text,
                      p.registration_name,
                      p.registration_number,
                      p.effective_date,
                      p.company,
                      p.updated_at_ms,
                      a.audio_asset_id AS active_audio_asset_id,
                      a.source_type AS active_audio_source_type,
                      a.text_snapshot AS active_audio_text_snapshot,
                      a.mimetype AS active_audio_mimetype,
                      a.updated_at_ms AS active_audio_updated_at_ms
                    FROM hall_products p
                    LEFT JOIN product_audio_assets a
                      ON a.product_id = p.product_id
                     AND a.is_active = 1
                    WHERE p.hall_id=?
                    ORDER BY p.sort_order ASC, p.product_id ASC
                    """,
                    (hid,),
                ).fetchall()
                return [dict(row) for row in rows]
            finally:
                conn.close()

    def get_hall_summary(self, hall_id: str) -> dict:
        hid = str(hall_id or "").strip()
        if not hid:
            return {"product_count": 0, "active_audio_count": 0, "updated_at_ms": 0}
        with self._lock:
            conn = self._connect()
            try:
                product_count_row = conn.execute(
                    "SELECT COUNT(1) AS product_count FROM hall_products WHERE hall_id=?",
                    (hid,),
                ).fetchone()
                active_audio_row = conn.execute(
                    """
                    SELECT COUNT(1) AS active_audio_count
                    FROM hall_products p
                    JOIN product_audio_assets a
                      ON a.product_id = p.product_id
                     AND a.is_active = 1
                    WHERE p.hall_id=?
                    """,
                    (hid,),
                ).fetchone()
                updated_row = conn.execute(
                    """
                    SELECT MAX(updated_at_ms) AS updated_at_ms
                    FROM (
                        SELECT updated_at_ms
                        FROM hall_products
                        WHERE hall_id=?
                        UNION ALL
                        SELECT a.updated_at_ms
                        FROM product_audio_assets a
                        JOIN hall_products p ON p.product_id = a.product_id
                        WHERE p.hall_id=?
                        UNION ALL
                        SELECT i.updated_at_ms
                        FROM product_image_assets i
                        JOIN hall_products p ON p.product_id = i.product_id
                        WHERE p.hall_id=?
                        UNION ALL
                        SELECT s.updated_at_ms
                        FROM pad_hall_scenes s
                        WHERE s.hall_id=?
                        UNION ALL
                        SELECT h.updated_at_ms
                        FROM pad_hall_scene_hotspots h
                        JOIN pad_hall_scenes s ON s.scene_id = h.scene_id
                        WHERE s.hall_id=?
                        UNION ALL
                        SELECT updated_at_ms
                        FROM pad_hall_station_configs
                        WHERE hall_id=?
                        UNION ALL
                        SELECT updated_at_ms
                        FROM pad_hall_station_hotspots
                        WHERE hall_id=?
                        UNION ALL
                        SELECT updated_at_ms
                        FROM pad_hall_stations
                        WHERE hall_id=?
                        UNION ALL
                        SELECT updated_at_ms
                        FROM pad_station_narration_timeline_events
                        WHERE hall_id=?
                        UNION ALL
                        SELECT updated_at_ms
                        FROM pad_display_bindings
                        WHERE hall_id=?
                    )
                    """,
                    (hid, hid, hid, hid, hid, hid, hid, hid, hid, hid),
                ).fetchone()
                return {
                    "product_count": int(product_count_row["product_count"] or 0) if product_count_row else 0,
                    "active_audio_count": int(active_audio_row["active_audio_count"] or 0) if active_audio_row else 0,
                    "updated_at_ms": int(updated_row["updated_at_ms"] or 0) if updated_row else 0,
                }
            finally:
                conn.close()

    def get_hall_manifest_version(self, hall_id: str) -> int:
        return int(self.get_hall_summary(hall_id).get("updated_at_ms") or 0)

    def create_audio_asset(
        self,
        *,
        product_id: str,
        source_type: str,
        text_snapshot: str,
        rel_path: str,
        mimetype: str,
        activate: bool = True,
    ) -> dict:
        pid = str(product_id or "").strip()
        if not pid:
            raise ValueError("product_id_required")
        if not self.get_product(pid):
            raise ValueError("product_not_found")
        source = str(source_type or "").strip().lower()
        if source not in {"recorded", "tts"}:
            raise ValueError("source_type_invalid")
        rel = str(rel_path or "").replace("\\", "/").lstrip("/")
        if not rel:
            raise ValueError("rel_path_required")
        mime = str(mimetype or "").strip() or "application/octet-stream"
        now_ms = self._now_ms()
        asset_id = f"audio_{uuid.uuid4().hex}"

        with self._lock:
            conn = self._connect()
            try:
                if activate:
                    conn.execute(
                        "UPDATE product_audio_assets SET is_active=0, updated_at_ms=? WHERE product_id=? AND is_active=1",
                        (int(now_ms), pid),
                    )
                conn.execute(
                    """
                    INSERT INTO product_audio_assets (
                        audio_asset_id,
                        product_id,
                        source_type,
                        text_snapshot,
                        rel_path,
                        mimetype,
                        is_active,
                        created_at_ms,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        asset_id,
                        pid,
                        source,
                        str(text_snapshot or ""),
                        rel,
                        mime,
                        1 if activate else 0,
                        int(now_ms),
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_audio_asset(asset_id) or {}

    def get_audio_asset(self, audio_asset_id: str) -> dict | None:
        aid = str(audio_asset_id or "").strip()
        if not aid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                      a.audio_asset_id,
                      a.product_id,
                      a.source_type,
                      a.text_snapshot,
                      a.rel_path,
                      a.mimetype,
                      a.is_active,
                      a.created_at_ms,
                      a.updated_at_ms,
                      p.hall_id
                    FROM product_audio_assets a
                    JOIN hall_products p ON p.product_id = a.product_id
                    WHERE a.audio_asset_id=?
                    """,
                    (aid,),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def get_current_audio_asset(self, product_id: str) -> dict | None:
        pid = str(product_id or "").strip()
        if not pid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                      a.audio_asset_id,
                      a.product_id,
                      a.source_type,
                      a.text_snapshot,
                      a.rel_path,
                      a.mimetype,
                      a.is_active,
                      a.created_at_ms,
                      a.updated_at_ms,
                      p.hall_id
                    FROM product_audio_assets a
                    JOIN hall_products p ON p.product_id = a.product_id
                    WHERE a.product_id=? AND a.is_active=1
                    LIMIT 1
                    """,
                    (pid,),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def get_manifest_items(self, hall_id: str) -> list[dict]:
        return self.list_hall_products(hall_id)

    def create_image_asset(
        self,
        *,
        product_id: str,
        rel_path: str,
        mimetype: str,
    ) -> dict:
        pid = str(product_id or "").strip()
        if not pid:
            raise ValueError("product_id_required")
        if not self.get_product(pid):
            raise ValueError("product_not_found")
        rel = str(rel_path or "").replace("\\", "/").lstrip("/")
        if not rel:
            raise ValueError("rel_path_required")
        mime = str(mimetype or "").strip()
        if not mime:
            raise ValueError("mimetype_required")
        now_ms = self._now_ms()
        asset_id = f"image_{uuid.uuid4().hex}"

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO product_image_assets (
                        image_asset_id,
                        product_id,
                        rel_path,
                        mimetype,
                        created_at_ms,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        asset_id,
                        pid,
                        rel,
                        mime,
                        int(now_ms),
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_image_asset(asset_id) or {}

    def list_product_image_assets(self, product_id: str) -> list[dict]:
        pid = str(product_id or "").strip()
        if not pid:
            return []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT
                      i.image_asset_id,
                      i.product_id,
                      i.rel_path,
                      i.mimetype,
                      i.created_at_ms,
                      i.updated_at_ms,
                      p.hall_id
                    FROM product_image_assets i
                    JOIN hall_products p ON p.product_id = i.product_id
                    WHERE i.product_id=?
                    ORDER BY i.created_at_ms DESC, i.image_asset_id DESC
                    """,
                    (pid,),
                ).fetchall()
                return [dict(row) for row in rows]
            finally:
                conn.close()

    def get_image_asset(self, image_asset_id: str) -> dict | None:
        aid = str(image_asset_id or "").strip()
        if not aid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                      i.image_asset_id,
                      i.product_id,
                      i.rel_path,
                      i.mimetype,
                      i.created_at_ms,
                      i.updated_at_ms,
                      p.hall_id
                    FROM product_image_assets i
                    JOIN hall_products p ON p.product_id = i.product_id
                    WHERE i.image_asset_id=?
                    LIMIT 1
                    """,
                    (aid,),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def create_hall_scene(
        self,
        *,
        scene_id: str,
        hall_id: str,
        name: str,
        sort_order: int,
        background_rel_path: str,
        background_mimetype: str,
        base_width: int,
        base_height: int,
    ) -> dict:
        sid = str(scene_id or "").strip()
        hid = str(hall_id or "").strip()
        scene_name = str(name or "").strip()
        rel = str(background_rel_path or "").replace("\\", "/").lstrip("/")
        mimetype = str(background_mimetype or "").strip()
        if not sid:
            raise ValueError("scene_id_required")
        if not hid:
            raise ValueError("hall_id_required")
        if not scene_name:
            raise ValueError("scene_name_required")
        if not rel:
            raise ValueError("background_rel_path_required")
        if not mimetype:
            raise ValueError("background_mimetype_required")
        width = int(base_width or 0)
        height = int(base_height or 0)
        if width <= 0:
            raise ValueError("base_width_invalid")
        if height <= 0:
            raise ValueError("base_height_invalid")
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO pad_hall_scenes (
                        scene_id,
                        hall_id,
                        name,
                        sort_order,
                        background_rel_path,
                        background_mimetype,
                        base_width,
                        base_height,
                        created_at_ms,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sid,
                        hid,
                        scene_name,
                        int(sort_order or 0),
                        rel,
                        mimetype,
                        width,
                        height,
                        int(now_ms),
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_hall_scene(sid) or {}

    def list_hall_scenes(self, hall_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        if not hid:
            return []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT
                      s.scene_id,
                      s.hall_id,
                      s.name,
                      s.sort_order,
                      s.background_rel_path,
                      s.background_mimetype,
                      s.base_width,
                      s.base_height,
                      s.created_at_ms,
                      s.updated_at_ms,
                      COUNT(h.hotspot_id) AS hotspot_count
                    FROM pad_hall_scenes s
                    LEFT JOIN pad_hall_scene_hotspots h
                      ON h.scene_id = s.scene_id
                    WHERE s.hall_id=?
                    GROUP BY
                      s.scene_id,
                      s.hall_id,
                      s.name,
                      s.sort_order,
                      s.background_rel_path,
                      s.background_mimetype,
                      s.base_width,
                      s.base_height,
                      s.created_at_ms,
                      s.updated_at_ms
                    ORDER BY s.sort_order ASC, s.scene_id ASC
                    """,
                    (hid,),
                ).fetchall()
                return [dict(row) for row in rows]
            finally:
                conn.close()

    def list_hall_scenes_with_hotspots(self, hall_id: str) -> list[dict]:
        scenes = self.list_hall_scenes(hall_id)
        for scene in scenes:
            scene["hotspots"] = self.list_scene_hotspots(str(scene.get("scene_id") or ""))
        return scenes

    def get_hall_scene(self, scene_id: str) -> dict | None:
        sid = str(scene_id or "").strip()
        if not sid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                      s.scene_id,
                      s.hall_id,
                      s.name,
                      s.sort_order,
                      s.background_rel_path,
                      s.background_mimetype,
                      s.base_width,
                      s.base_height,
                      s.created_at_ms,
                      s.updated_at_ms,
                      COUNT(h.hotspot_id) AS hotspot_count
                    FROM pad_hall_scenes s
                    LEFT JOIN pad_hall_scene_hotspots h
                      ON h.scene_id = s.scene_id
                    WHERE s.scene_id=?
                    GROUP BY
                      s.scene_id,
                      s.hall_id,
                      s.name,
                      s.sort_order,
                      s.background_rel_path,
                      s.background_mimetype,
                      s.base_width,
                      s.base_height,
                      s.created_at_ms,
                      s.updated_at_ms
                    LIMIT 1
                    """,
                    (sid,),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def update_hall_scene(self, *, scene_id: str, name: str, sort_order: int) -> dict | None:
        sid = str(scene_id or "").strip()
        scene_name = str(name or "").strip()
        if not sid:
            raise ValueError("scene_id_required")
        if not scene_name:
            raise ValueError("scene_name_required")
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE pad_hall_scenes
                    SET name=?, sort_order=?, updated_at_ms=?
                    WHERE scene_id=?
                    """,
                    (scene_name, int(sort_order or 0), int(now_ms), sid),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_hall_scene(sid)

    def update_hall_scene_background(
        self,
        *,
        scene_id: str,
        background_rel_path: str,
        background_mimetype: str,
        base_width: int,
        base_height: int,
    ) -> dict | None:
        sid = str(scene_id or "").strip()
        rel = str(background_rel_path or "").replace("\\", "/").lstrip("/")
        mimetype = str(background_mimetype or "").strip()
        if not sid:
            raise ValueError("scene_id_required")
        if not rel:
            raise ValueError("background_rel_path_required")
        if not mimetype:
            raise ValueError("background_mimetype_required")
        width = int(base_width or 0)
        height = int(base_height or 0)
        if width <= 0:
            raise ValueError("base_width_invalid")
        if height <= 0:
            raise ValueError("base_height_invalid")
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE pad_hall_scenes
                    SET background_rel_path=?, background_mimetype=?, base_width=?, base_height=?, updated_at_ms=?
                    WHERE scene_id=?
                    """,
                    (rel, mimetype, width, height, int(now_ms), sid),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_hall_scene(sid)

    def delete_hall_scene(self, *, scene_id: str) -> dict | None:
        sid = str(scene_id or "").strip()
        if not sid:
            return None
        scene = self.get_hall_scene(sid)
        if not scene:
            return None
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM pad_hall_scene_hotspots WHERE scene_id=?", (sid,))
                conn.execute("DELETE FROM pad_hall_scenes WHERE scene_id=?", (sid,))
                conn.commit()
            finally:
                conn.close()
        return scene

    def create_scene_hotspot(
        self,
        *,
        scene_id: str,
        sort_order: int,
        x_pct,
        y_pct,
        width_pct,
        height_pct,
        title: str,
        content_text: str,
    ) -> dict:
        sid = str(scene_id or "").strip()
        if not sid:
            raise ValueError("scene_id_required")
        if not self.get_hall_scene(sid):
            raise ValueError("scene_not_found")
        x_value, y_value, width_value, height_value = _normalize_hotspot_geometry(
            x_pct=x_pct,
            y_pct=y_pct,
            width_pct=width_pct,
            height_pct=height_pct,
        )
        hotspot_id = f"hotspot_{uuid.uuid4().hex}"
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO pad_hall_scene_hotspots (
                        hotspot_id,
                        scene_id,
                        sort_order,
                        x_pct,
                        y_pct,
                        width_pct,
                        height_pct,
                        title,
                        content_text,
                        created_at_ms,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        hotspot_id,
                        sid,
                        int(sort_order or 0),
                        float(x_value),
                        float(y_value),
                        float(width_value),
                        float(height_value),
                        str(title or "").strip(),
                        str(content_text or "").strip(),
                        int(now_ms),
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_scene_hotspot(hotspot_id) or {}

    def list_scene_hotspots(self, scene_id: str) -> list[dict]:
        sid = str(scene_id or "").strip()
        if not sid:
            return []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT
                      h.hotspot_id,
                      h.scene_id,
                      s.hall_id,
                      h.sort_order,
                      h.x_pct,
                      h.y_pct,
                      h.width_pct,
                      h.height_pct,
                      h.title,
                      h.content_text,
                      h.created_at_ms,
                      h.updated_at_ms
                    FROM pad_hall_scene_hotspots h
                    JOIN pad_hall_scenes s ON s.scene_id = h.scene_id
                    WHERE h.scene_id=?
                    ORDER BY h.sort_order ASC, h.hotspot_id ASC
                    """,
                    (sid,),
                ).fetchall()
                return [dict(row) for row in rows]
            finally:
                conn.close()

    def get_scene_hotspot(self, hotspot_id: str) -> dict | None:
        hid = str(hotspot_id or "").strip()
        if not hid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                      h.hotspot_id,
                      h.scene_id,
                      s.hall_id,
                      h.sort_order,
                      h.x_pct,
                      h.y_pct,
                      h.width_pct,
                      h.height_pct,
                      h.title,
                      h.content_text,
                      h.created_at_ms,
                      h.updated_at_ms
                    FROM pad_hall_scene_hotspots h
                    JOIN pad_hall_scenes s ON s.scene_id = h.scene_id
                    WHERE h.hotspot_id=?
                    LIMIT 1
                    """,
                    (hid,),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def update_scene_hotspot(
        self,
        *,
        scene_id: str,
        hotspot_id: str,
        sort_order: int,
        x_pct,
        y_pct,
        width_pct,
        height_pct,
        title: str,
        content_text: str,
    ) -> dict | None:
        sid = str(scene_id or "").strip()
        hid = str(hotspot_id or "").strip()
        if not sid:
            raise ValueError("scene_id_required")
        if not hid:
            raise ValueError("hotspot_id_required")
        hotspot = self.get_scene_hotspot(hid)
        if not hotspot or str(hotspot.get("scene_id") or "") != sid:
            raise ValueError("hotspot_not_found")
        x_value, y_value, width_value, height_value = _normalize_hotspot_geometry(
            x_pct=x_pct,
            y_pct=y_pct,
            width_pct=width_pct,
            height_pct=height_pct,
        )
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE pad_hall_scene_hotspots
                    SET sort_order=?, x_pct=?, y_pct=?, width_pct=?, height_pct=?, title=?, content_text=?, updated_at_ms=?
                    WHERE hotspot_id=? AND scene_id=?
                    """,
                    (
                        int(sort_order or 0),
                        float(x_value),
                        float(y_value),
                        float(width_value),
                        float(height_value),
                        str(title or "").strip(),
                        str(content_text or "").strip(),
                        int(now_ms),
                        hid,
                        sid,
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_scene_hotspot(hid)

    def delete_scene_hotspot(self, *, scene_id: str, hotspot_id: str) -> dict | None:
        sid = str(scene_id or "").strip()
        hid = str(hotspot_id or "").strip()
        if not sid or not hid:
            return None
        hotspot = self.get_scene_hotspot(hid)
        if not hotspot or str(hotspot.get("scene_id") or "") != sid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM pad_hall_scene_hotspots WHERE hotspot_id=? AND scene_id=?", (hid, sid))
                conn.commit()
            finally:
                conn.close()
        return hotspot

    def _station_config_defaults(self, *, hall_id: str, station_key: str) -> dict:
        key = _normalize_station_key(station_key)
        station_meta = self.get_hall_station(hall_id=str(hall_id or "").strip(), station_id=key)
        return {
            "hall_id": str(hall_id or "").strip(),
            "station_key": key,
            "station_id": key,
            "label": str((station_meta or {}).get("label") or ""),
            "recording_id": "",
            "stop_index": None,
            "stop_name": "",
            "background_rel_path": "",
            "background_mimetype": "",
            "wireframe_rel_path": "",
            "wireframe_mimetype": "",
            "base_width": 0,
            "base_height": 0,
            "created_at_ms": 0,
            "updated_at_ms": 0,
        }

    def get_station_config(self, *, hall_id: str, station_key: str) -> dict:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        if not hid:
            raise ValueError("hall_id_required")
        row = None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                      hall_id,
                      station_key,
                      label,
                      recording_id,
                      stop_index,
                      stop_name,
                      background_rel_path,
                      background_mimetype,
                      wireframe_rel_path,
                      wireframe_mimetype,
                      base_width,
                      base_height,
                      created_at_ms,
                      updated_at_ms
                    FROM pad_hall_station_configs
                    WHERE hall_id=? AND station_key=?
                    LIMIT 1
                    """,
                    (hid, key),
                ).fetchone()
            finally:
                conn.close()
        if not row:
            return self._station_config_defaults(hall_id=hid, station_key=key)
        item = self._station_config_defaults(hall_id=hid, station_key=key)
        item.update(dict(row))
        return item

    def list_station_configs(self, *, hall_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        if not hid:
            return []
        catalog = self.list_hall_stations(hall_id=hid)
        if catalog:
            return [self.get_station_config(hall_id=hid, station_key=str(item.get("station_id") or "")) for item in catalog]
        return [self.get_station_config(hall_id=hid, station_key=station_key) for station_key in ("station_a", "station_b")]

    def list_display_station_configs(self, *, client_id: str) -> list[dict]:
        binding = self.get_display_binding(client_id, enabled_only=True)
        if not binding:
            return []
        hall_id = str(binding.get("hall_id") or "").strip()
        items: list[dict] = []
        for slot_key, station_id in self.resolve_display_station_ids(client_id=client_id):
            station = self.get_station_config(hall_id=hall_id, station_key=station_id)
            station["slot_key"] = slot_key
            station["station_id"] = station_id
            station["timeline_events"] = self.list_station_narration_timeline_events(hall_id=hall_id, station_id=station_id)
            items.append(station)
        return items

    def upsert_station_config(
        self,
        *,
        hall_id: str,
        station_key: str,
        label: str,
        recording_id: str,
        stop_index,
        stop_name: str,
    ) -> dict:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        if not hid:
            raise ValueError("hall_id_required")
        self.upsert_hall_station(hall_id=hid, station_id=key, label=str(label or "").strip() or key)
        current = self.get_station_config(hall_id=hid, station_key=key)
        now_ms = self._now_ms()
        normalized_stop_index = None if stop_index is None or str(stop_index).strip() == "" else int(stop_index)
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO pad_hall_station_configs (
                        hall_id,
                        station_key,
                        label,
                        recording_id,
                        stop_index,
                        stop_name,
                        background_rel_path,
                        background_mimetype,
                        wireframe_rel_path,
                        wireframe_mimetype,
                        base_width,
                        base_height,
                        created_at_ms,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hall_id, station_key) DO UPDATE SET
                        label=excluded.label,
                        recording_id=excluded.recording_id,
                        stop_index=excluded.stop_index,
                        stop_name=excluded.stop_name,
                        updated_at_ms=excluded.updated_at_ms
                    """,
                    (
                        hid,
                        key,
                        str(label or "").strip(),
                        str(recording_id or "").strip(),
                        normalized_stop_index,
                        str(stop_name or "").strip(),
                        str(current.get("background_rel_path") or ""),
                        str(current.get("background_mimetype") or ""),
                        str(current.get("wireframe_rel_path") or ""),
                        str(current.get("wireframe_mimetype") or ""),
                        int(current.get("base_width") or 0),
                        int(current.get("base_height") or 0),
                        int(current.get("created_at_ms") or now_ms),
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_station_config(hall_id=hid, station_key=key)

    def update_station_visual_assets(
        self,
        *,
        hall_id: str,
        station_key: str,
        background_rel_path: str | None = None,
        background_mimetype: str | None = None,
        wireframe_rel_path: str | None = None,
        wireframe_mimetype: str | None = None,
        base_width: int | None = None,
        base_height: int | None = None,
    ) -> dict:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        if not hid:
            raise ValueError("hall_id_required")
        current = self.get_station_config(hall_id=hid, station_key=key)
        now_ms = self._now_ms()
        next_background_rel_path = str(background_rel_path) if background_rel_path is not None else str(current.get("background_rel_path") or "")
        next_background_mimetype = str(background_mimetype) if background_mimetype is not None else str(current.get("background_mimetype") or "")
        next_wireframe_rel_path = str(wireframe_rel_path) if wireframe_rel_path is not None else str(current.get("wireframe_rel_path") or "")
        next_wireframe_mimetype = str(wireframe_mimetype) if wireframe_mimetype is not None else str(current.get("wireframe_mimetype") or "")
        next_base_width = int(base_width) if base_width is not None else int(current.get("base_width") or 0)
        next_base_height = int(base_height) if base_height is not None else int(current.get("base_height") or 0)
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO pad_hall_station_configs (
                        hall_id,
                        station_key,
                        label,
                        recording_id,
                        stop_index,
                        stop_name,
                        background_rel_path,
                        background_mimetype,
                        wireframe_rel_path,
                        wireframe_mimetype,
                        base_width,
                        base_height,
                        created_at_ms,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hall_id, station_key) DO UPDATE SET
                        background_rel_path=excluded.background_rel_path,
                        background_mimetype=excluded.background_mimetype,
                        wireframe_rel_path=excluded.wireframe_rel_path,
                        wireframe_mimetype=excluded.wireframe_mimetype,
                        base_width=excluded.base_width,
                        base_height=excluded.base_height,
                        updated_at_ms=excluded.updated_at_ms
                    """,
                    (
                        hid,
                        key,
                        str(current.get("label") or ""),
                        str(current.get("recording_id") or ""),
                        current.get("stop_index"),
                        str(current.get("stop_name") or ""),
                        next_background_rel_path,
                        next_background_mimetype,
                        next_wireframe_rel_path,
                        next_wireframe_mimetype,
                        next_base_width,
                        next_base_height,
                        int(current.get("created_at_ms") or now_ms),
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_station_config(hall_id=hid, station_key=key)

    def list_station_hotspots(self, *, hall_id: str, station_key: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        if not hid:
            raise ValueError("hall_id_required")
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT
                      hotspot_id,
                      hall_id,
                      station_key,
                      product_id,
                      sort_order,
                      x_pct,
                      y_pct,
                      width_pct,
                      height_pct,
                      created_at_ms,
                      updated_at_ms
                    FROM pad_hall_station_hotspots
                    WHERE hall_id=? AND station_key=?
                    ORDER BY sort_order ASC, hotspot_id ASC
                    """,
                    (hid, key),
                ).fetchall()
                return [dict(row) for row in rows]
            finally:
                conn.close()

    def get_station_hotspot(self, hotspot_id: str) -> dict | None:
        hid = str(hotspot_id or "").strip()
        if not hid:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT
                      hotspot_id,
                      hall_id,
                      station_key,
                      product_id,
                      sort_order,
                      x_pct,
                      y_pct,
                      width_pct,
                      height_pct,
                      created_at_ms,
                      updated_at_ms
                    FROM pad_hall_station_hotspots
                    WHERE hotspot_id=?
                    LIMIT 1
                    """,
                    (hid,),
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def create_station_hotspot(
        self,
        *,
        hall_id: str,
        station_key: str,
        product_id: str,
        sort_order: int,
        x_pct,
        y_pct,
        width_pct,
        height_pct,
    ) -> dict:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        pid = str(product_id or "").strip()
        if not hid:
            raise ValueError("hall_id_required")
        if not pid:
            raise ValueError("product_id_required")
        product = self.get_product(pid)
        if not product or str(product.get("hall_id") or "") != hid:
            raise ValueError("product_not_found")
        x_value, y_value, width_value, height_value = _normalize_hotspot_geometry(
            x_pct=x_pct,
            y_pct=y_pct,
            width_pct=width_pct,
            height_pct=height_pct,
        )
        hotspot_id = f"station_hotspot_{uuid.uuid4().hex}"
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO pad_hall_station_hotspots (
                        hotspot_id,
                        hall_id,
                        station_key,
                        product_id,
                        sort_order,
                        x_pct,
                        y_pct,
                        width_pct,
                        height_pct,
                        created_at_ms,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        hotspot_id,
                        hid,
                        key,
                        pid,
                        int(sort_order or 0),
                        float(x_value),
                        float(y_value),
                        float(width_value),
                        float(height_value),
                        int(now_ms),
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_station_hotspot(hotspot_id) or {}

    def update_station_hotspot(
        self,
        *,
        hall_id: str,
        station_key: str,
        hotspot_id: str,
        product_id: str,
        sort_order: int,
        x_pct,
        y_pct,
        width_pct,
        height_pct,
    ) -> dict:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        hotspot_key = str(hotspot_id or "").strip()
        pid = str(product_id or "").strip()
        if not hid:
            raise ValueError("hall_id_required")
        if not hotspot_key:
            raise ValueError("hotspot_id_required")
        if not pid:
            raise ValueError("product_id_required")
        hotspot = self.get_station_hotspot(hotspot_key)
        if not hotspot or str(hotspot.get("hall_id") or "") != hid or str(hotspot.get("station_key") or "") != key:
            raise ValueError("hotspot_not_found")
        product = self.get_product(pid)
        if not product or str(product.get("hall_id") or "") != hid:
            raise ValueError("product_not_found")
        x_value, y_value, width_value, height_value = _normalize_hotspot_geometry(
            x_pct=x_pct,
            y_pct=y_pct,
            width_pct=width_pct,
            height_pct=height_pct,
        )
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE pad_hall_station_hotspots
                    SET product_id=?, sort_order=?, x_pct=?, y_pct=?, width_pct=?, height_pct=?, updated_at_ms=?
                    WHERE hotspot_id=? AND hall_id=? AND station_key=?
                    """,
                    (
                        pid,
                        int(sort_order or 0),
                        float(x_value),
                        float(y_value),
                        float(width_value),
                        float(height_value),
                        int(now_ms),
                        hotspot_key,
                        hid,
                        key,
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_station_hotspot(hotspot_key) or {}

    def delete_station_hotspot(self, *, hall_id: str, station_key: str, hotspot_id: str) -> dict | None:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        hotspot_key = str(hotspot_id or "").strip()
        if not hid or not hotspot_key:
            return None
        hotspot = self.get_station_hotspot(hotspot_key)
        if not hotspot or str(hotspot.get("hall_id") or "") != hid or str(hotspot.get("station_key") or "") != key:
            return None
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "DELETE FROM pad_hall_station_hotspots WHERE hotspot_id=? AND hall_id=? AND station_key=?",
                    (hotspot_key, hid, key),
                )
                conn.commit()
            finally:
                conn.close()
        return hotspot

    def list_station_narration_timeline_events(self, *, hall_id: str, station_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            raise ValueError("hall_id_required")
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT
                      event_id,
                      hall_id,
                      station_id,
                      sort_order,
                      time_ms,
                      product_id,
                      station_hotspot_id,
                      event_type,
                      created_at_ms,
                      updated_at_ms
                    FROM pad_station_narration_timeline_events
                    WHERE hall_id=? AND station_id=?
                    ORDER BY sort_order ASC, time_ms ASC, event_id ASC
                    """,
                    (hid, sid),
                ).fetchall()
                return [dict(row) for row in rows]
            finally:
                conn.close()

    def replace_station_narration_timeline_events(self, *, hall_id: str, station_id: str, events: list[dict]) -> list[dict]:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            raise ValueError("hall_id_required")
        if not isinstance(events, list):
            raise ValueError("timeline_events_must_be_list")
        normalized: list[dict] = []
        hotspot_map = {
            str(item.get("hotspot_id") or ""): item
            for item in self.list_station_hotspots(hall_id=hid, station_key=sid)
        }
        now_ms = self._now_ms()
        for index, raw in enumerate(events):
            item = raw if isinstance(raw, dict) else {}
            try:
                time_ms = int(item.get("time_ms"))
            except Exception as exc:
                raise ValueError("time_ms_invalid") from exc
            if time_ms < 0:
                raise ValueError("time_ms_invalid")
            product_id = str(item.get("product_id") or "").strip()
            hotspot_id = str(item.get("station_hotspot_id") or item.get("hotspot_id") or "").strip()
            event_type = str(item.get("event_type") or "focus_switch").strip() or "focus_switch"
            if event_type not in {"focus_switch", "highlight_on", "highlight_off"}:
                raise ValueError("event_type_invalid")
            hotspot = hotspot_map.get(hotspot_id)
            if not hotspot:
                raise ValueError("station_hotspot_not_found")
            if product_id and str(hotspot.get("product_id") or "") != product_id:
                raise ValueError("timeline_product_mismatch")
            normalized.append(
                {
                    "event_id": f"timeline_{uuid.uuid4().hex}",
                    "hall_id": hid,
                    "station_id": sid,
                    "sort_order": int(item.get("sort_order") if item.get("sort_order") is not None else index),
                    "time_ms": time_ms,
                    "product_id": str(hotspot.get("product_id") or ""),
                    "station_hotspot_id": hotspot_id,
                    "event_type": event_type,
                    "created_at_ms": int(now_ms),
                    "updated_at_ms": int(now_ms),
                }
            )
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "DELETE FROM pad_station_narration_timeline_events WHERE hall_id=? AND station_id=?",
                    (hid, sid),
                )
                for event in normalized:
                    conn.execute(
                        """
                        INSERT INTO pad_station_narration_timeline_events (
                            event_id, hall_id, station_id, sort_order, time_ms, product_id,
                            station_hotspot_id, event_type, created_at_ms, updated_at_ms
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            event["event_id"],
                            event["hall_id"],
                            event["station_id"],
                            event["sort_order"],
                            event["time_ms"],
                            event["product_id"],
                            event["station_hotspot_id"],
                            event["event_type"],
                            event["created_at_ms"],
                            event["updated_at_ms"],
                        ),
                    )
                conn.commit()
            finally:
                conn.close()
        return self.list_station_narration_timeline_events(hall_id=hid, station_id=sid)
