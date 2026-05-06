from __future__ import annotations

import logging
import os
import shutil
import sqlite3
import threading
import time
import uuid
from pathlib import Path


def _safe_path_part(value: str, *, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name}_required")
    if text != text.strip("._"):
        raise ValueError(f"{field_name}_invalid")
    if any(not (ch.isalnum() or ch in {"-", "_", "."}) for ch in text):
        raise ValueError(f"{field_name}_invalid")
    return text


def _normalize_rel_path(value: str) -> str:
    rel = str(value or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise ValueError("bad_path")
    return rel


def _normalize_optional_rel_path(value: str | None, current: str) -> str:
    if value is None:
        return str(current or "")
    if not str(value or "").strip():
        return ""
    return _normalize_rel_path(value)


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


PRODUCT_SOURCE_IMPORTED = "imported"
PRODUCT_SOURCE_MANUAL_PLACEHOLDER = "manual_placeholder"


CONTROL_HOTSPOT_SPECS = {
    "__control_toggle_station__": {
        "label": "站台切换",
        "sort_order": -400,
        "x_pct": 0.02,
        "y_pct": 0.05,
        "width_pct": 0.08,
        "height_pct": 0.18,
    },
    "__control_toggle_station_narration__": {
        "label": "全站讲解",
        "sort_order": -399,
        "x_pct": 0.02,
        "y_pct": 0.27,
        "width_pct": 0.08,
        "height_pct": 0.2,
    },
    "__control_enter_ops__": {
        "label": "运维",
        "sort_order": -398,
        "x_pct": 0.02,
        "y_pct": 0.52,
        "width_pct": 0.08,
        "height_pct": 0.14,
    },
    "__control_exit_app__": {
        "label": "退出",
        "sort_order": -397,
        "x_pct": 0.02,
        "y_pct": 0.82,
        "width_pct": 0.08,
        "height_pct": 0.14,
    },
}


def _is_control_hotspot_product_id(product_id: str) -> bool:
    return str(product_id or "").strip() in CONTROL_HOTSPOT_SPECS


def _normalize_product_source(value: str | None) -> str:
    source = str(value or "").strip().lower()
    if source == PRODUCT_SOURCE_MANUAL_PLACEHOLDER:
        return PRODUCT_SOURCE_MANUAL_PLACEHOLDER
    return PRODUCT_SOURCE_IMPORTED


def _is_manual_placeholder_product_source(value: str | None) -> bool:
    return str(value or "").strip().lower() == PRODUCT_SOURCE_MANUAL_PLACEHOLDER


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
                        product_source TEXT NOT NULL DEFAULT 'imported',
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
                        product_id TEXT,
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
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_station_narration_nodes (
                        node_id TEXT PRIMARY KEY,
                        hall_id TEXT NOT NULL,
                        station_id TEXT NOT NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        recording_id TEXT NOT NULL,
                        stop_index INTEGER,
                        stop_name TEXT NOT NULL DEFAULT '',
                        highlight_start_ms INTEGER NOT NULL,
                        highlight_end_ms INTEGER NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        updated_at_ms INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_station_narration_nodes_station ON pad_station_narration_nodes(hall_id, station_id, sort_order, highlight_start_ms, node_id);"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pad_station_narration_node_hotspots (
                        node_id TEXT NOT NULL,
                        hall_id TEXT NOT NULL,
                        station_id TEXT NOT NULL,
                        station_hotspot_id TEXT NOT NULL,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (node_id, station_hotspot_id)
                    );
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pad_station_narration_node_hotspots_station ON pad_station_narration_node_hotspots(hall_id, station_id, node_id, sort_order, station_hotspot_id);"
                )
                self._migrate_hall_products_table(conn)
                self._migrate_station_hotspots_table(conn)
                conn.commit()
            finally:
                conn.close()

    def _migrate_hall_products_table(self, conn: sqlite3.Connection) -> None:
        columns = {
            str(row["name"] or ""): row
            for row in conn.execute("PRAGMA table_info(hall_products)").fetchall()
        }
        if "product_source" not in columns:
            conn.execute(
                "ALTER TABLE hall_products ADD COLUMN product_source TEXT NOT NULL DEFAULT 'imported'"
            )
        conn.execute(
            "UPDATE hall_products SET product_source=? WHERE COALESCE(TRIM(product_source), '')=''",
            (PRODUCT_SOURCE_IMPORTED,),
        )

    def _migrate_station_hotspots_table(self, conn: sqlite3.Connection) -> None:
        columns = {
            str(row["name"] or ""): row
            for row in conn.execute("PRAGMA table_info(pad_hall_station_hotspots)").fetchall()
        }
        product_column = columns.get("product_id")
        if not product_column or not int(product_column["notnull"] or 0):
            return

        conn.execute("ALTER TABLE pad_hall_station_hotspots RENAME TO pad_hall_station_hotspots_old")
        conn.execute(
            """
            CREATE TABLE pad_hall_station_hotspots (
                hotspot_id TEXT PRIMARY KEY,
                hall_id TEXT NOT NULL,
                station_key TEXT NOT NULL,
                product_id TEXT,
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
            FROM pad_hall_station_hotspots_old
            """
        )
        conn.execute("DROP TABLE pad_hall_station_hotspots_old")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pad_hall_station_hotspots_station ON pad_hall_station_hotspots(hall_id, station_key, sort_order, hotspot_id);"
        )

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def audio_root(self) -> Path:
        self._audio_root.mkdir(parents=True, exist_ok=True)
        return self._audio_root

    def image_root(self) -> Path:
        self._image_root.mkdir(parents=True, exist_ok=True)
        return self._image_root

    def product_audio_dir(self, product_id: str) -> Path:
        pid = _safe_path_part(product_id, field_name="product_id")
        target = (self.audio_root() / pid).resolve()
        base = self.audio_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_audio_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def product_image_dir(self, product_id: str) -> Path:
        pid = _safe_path_part(product_id, field_name="product_id")
        target = (self.image_root() / pid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def scene_background_dir(self, *, hall_id: str, scene_id: str) -> Path:
        hid = _safe_path_part(hall_id, field_name="hall_id")
        sid = _safe_path_part(scene_id, field_name="scene_id")
        target = (self.image_root() / "scenes" / hid / sid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def station_asset_dir(self, *, hall_id: str, station_key: str) -> Path:
        hid = _safe_path_part(hall_id, field_name="hall_id")
        _safe_path_part(station_key, field_name="station_key")
        skey = _normalize_station_key(station_key)
        target = (self.image_root() / "stations" / hid / skey).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def build_audio_rel_path(self, *, product_id: str, filename: str) -> str:
        pid = _safe_path_part(product_id, field_name="product_id")
        fname = str(filename or "").replace("\\", "/").lstrip("/")
        if not fname or ".." in fname.split("/"):
            raise ValueError("bad_filename")
        return f"{pid}/{fname}"

    def build_image_rel_path(self, *, product_id: str, filename: str) -> str:
        pid = _safe_path_part(product_id, field_name="product_id")
        fname = str(filename or "").replace("\\", "/").lstrip("/")
        if not fname or ".." in fname.split("/"):
            raise ValueError("bad_filename")
        return f"{pid}/{fname}"

    def build_scene_background_rel_path(self, *, hall_id: str, scene_id: str, filename: str) -> str:
        hid = _safe_path_part(hall_id, field_name="hall_id")
        sid = _safe_path_part(scene_id, field_name="scene_id")
        fname = str(filename or "").replace("\\", "/").lstrip("/")
        if not fname or ".." in fname.split("/"):
            raise ValueError("bad_filename")
        return f"scenes/{hid}/{sid}/{fname}"

    def build_station_asset_rel_path(self, *, hall_id: str, station_key: str, filename: str) -> str:
        hid = _safe_path_part(hall_id, field_name="hall_id")
        _safe_path_part(station_key, field_name="station_key")
        skey = _normalize_station_key(station_key)
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
        pid = _safe_path_part(product_id, field_name="product_id")
        target = (self.audio_root() / pid).resolve()
        base = self.audio_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_audio_root")
        if target.exists() and target.is_dir():
            shutil.rmtree(target)

    def delete_product_image_dir(self, product_id: str) -> None:
        pid = _safe_path_part(product_id, field_name="product_id")
        target = (self.image_root() / pid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        if target.exists() and target.is_dir():
            shutil.rmtree(target)

    def delete_scene_background_dir(self, *, hall_id: str, scene_id: str) -> None:
        hid = _safe_path_part(hall_id, field_name="hall_id")
        sid = _safe_path_part(scene_id, field_name="scene_id")
        target = (self.image_root() / "scenes" / hid / sid).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        if target.exists() and target.is_dir():
            shutil.rmtree(target)

    def delete_station_asset_dir(self, *, hall_id: str, station_key: str) -> None:
        hid = _safe_path_part(hall_id, field_name="hall_id")
        _safe_path_part(station_key, field_name="station_key")
        skey = _normalize_station_key(station_key)
        target = (self.image_root() / "stations" / hid / skey).resolve()
        base = self.image_root().resolve()
        if not str(target).lower().startswith(str(base).lower() + os.sep.lower()):
            raise ValueError("path_outside_image_root")
        if target.exists() and target.is_dir():
            shutil.rmtree(target)

    def delete_image_rel_path(self, rel_path: str) -> None:
        target = self.resolve_image_rel_path(rel_path)
        if target.exists() and target.is_file():
            target.unlink()

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
        return [dict(row) for row in rows]

    def resolve_display_station_ids(self, *, client_id: str) -> list[tuple[str, str]]:
        binding = self.get_display_binding(client_id, enabled_only=True)
        if not binding:
            return []
        return [
            ("display_slot_1", _normalize_station_id(binding.get("slot_1_station_id") or "station_a")),
            ("display_slot_2", _normalize_station_id(binding.get("slot_2_station_id") or "station_b")),
        ]

    def _fetch_products_for_where(
        self,
        conn: sqlite3.Connection,
        *,
        where_sql: str = "",
        params: tuple | list = (),
        order_sql: str = "p.sort_order ASC, p.product_id ASC",
    ) -> list[dict]:
        query = f"""
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
              p.product_source,
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
            {where_sql}
            ORDER BY {order_sql}
        """
        rows = conn.execute(query, tuple(params or ())).fetchall()
        return [dict(row) for row in rows]

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
                    "product_source": _normalize_product_source(item.get("product_source")),
                    "updated_at_ms": int(item.get("updated_at_ms") or now_ms),
                }
            )

        deleted_ids: list[str] = []
        with self._lock:
            conn = self._connect()
            try:
                existing_rows = conn.execute(
                    "SELECT product_id, product_source FROM hall_products WHERE hall_id=?",
                    (hid,),
                ).fetchall()
                deleted_ids = [
                    str(row["product_id"])
                    for row in existing_rows
                    if str(row["product_id"]) not in keep_ids
                    and _normalize_product_source(row["product_source"]) == PRODUCT_SOURCE_IMPORTED
                ]

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
                            product_source,
                            updated_at_ms
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                          product_source=excluded.product_source,
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
                            product["product_source"],
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
                           registration_name, registration_number, effective_date, company, product_source, updated_at_ms
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
                return self._fetch_products_for_where(
                    conn,
                    where_sql="WHERE p.hall_id=?",
                    params=(hid,),
                )
            finally:
                conn.close()

    def list_products_by_ids(self, product_ids: list[str]) -> list[dict]:
        cleaned_ids = [str(product_id or "").strip() for product_id in (product_ids or []) if str(product_id or "").strip()]
        if not cleaned_ids:
            return []
        placeholders = ",".join("?" for _ in cleaned_ids)
        with self._lock:
            conn = self._connect()
            try:
                rows = self._fetch_products_for_where(
                    conn,
                    where_sql=f"WHERE p.product_id IN ({placeholders})",
                    params=tuple(cleaned_ids),
                )
            finally:
                conn.close()
        row_map = {str(row.get("product_id") or ""): row for row in rows}
        return [row_map[product_id] for product_id in cleaned_ids if product_id in row_map]

    def list_referenced_station_products(self, hall_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        if not hid:
            return []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT DISTINCT h.product_id
                    FROM pad_hall_station_hotspots h
                    JOIN hall_products p ON p.product_id = h.product_id
                    WHERE h.hall_id=?
                      AND COALESCE(TRIM(h.product_id), '')<>''
                      AND p.hall_id<>?
                    ORDER BY h.sort_order ASC, h.hotspot_id ASC
                    """,
                    (hid, hid),
                ).fetchall()
            finally:
                conn.close()
        product_ids = [str(row["product_id"] or "").strip() for row in rows if str(row["product_id"] or "").strip()]
        return self.list_products_by_ids(product_ids)

    def is_product_accessible_from_hall(self, *, hall_id: str, product_id: str) -> bool:
        hid = str(hall_id or "").strip()
        pid = str(product_id or "").strip()
        if not hid or not pid:
            return False
        product = self.get_product(pid)
        if not product:
            return False
        if str(product.get("hall_id") or "") == hid:
            return True
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT 1
                    FROM pad_hall_station_hotspots
                    WHERE hall_id=? AND product_id=?
                    LIMIT 1
                    """,
                    (hid, pid),
                ).fetchone()
                return row is not None
            finally:
                conn.close()

    def create_manual_placeholder_product(self, *, hall_id: str, product_name: str) -> dict:
        hid = str(hall_id or "").strip()
        name = str(product_name or "").strip()
        if not hid:
            raise ValueError("hall_id_required")
        if not name:
            raise ValueError("manual_product_name_required")
        now_ms = self._now_ms()
        product_id = f"manual_product_{uuid.uuid4().hex}"
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM hall_products WHERE hall_id=?",
                    (hid,),
                ).fetchone()
                next_sort_order = int((row["max_sort_order"] or 0) if row else 0) + 1
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
                        product_source,
                        updated_at_ms
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        product_id,
                        hid,
                        next_sort_order,
                        name,
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        PRODUCT_SOURCE_MANUAL_PLACEHOLDER,
                        int(now_ms),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_product(product_id) or {}

    def update_product(
        self,
        *,
        product_id: str,
        product_name: str | None = None,
        intro_text: str | None = None,
    ) -> dict:
        pid = str(product_id or "").strip()
        if not pid:
            raise ValueError("product_id_required")
        existing = self.get_product(pid)
        if not existing:
            raise ValueError("product_not_found")
        next_name = existing.get("product_name") if product_name is None else str(product_name or "").strip()
        if not str(next_name or "").strip():
            raise ValueError("product_name_required")
        next_intro = existing.get("intro_text") if intro_text is None else str(intro_text or "").strip()
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE hall_products
                    SET product_name=?, intro_text=?, updated_at_ms=?
                    WHERE product_id=?
                    """,
                    (str(next_name), str(next_intro), int(now_ms), pid),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_product(pid) or {}

    def search_products(self, *, query: str, limit: int = 20) -> list[dict]:
        text = str(query or "").strip()
        if not text:
            return []
        lowered = text.casefold()
        like_value = f"%{text}%"
        params = (text, text, text, like_value, like_value, like_value)
        with self._lock:
            conn = self._connect()
            try:
                rows = self._fetch_products_for_where(
                    conn,
                    where_sql="""
                    WHERE (
                        p.product_name = ?
                        OR p.product_name_en = ?
                        OR p.registration_name = ?
                        OR p.product_name LIKE ?
                        OR p.product_name_en LIKE ?
                        OR p.registration_name LIKE ?
                    )
                    """,
                    params=params,
                    order_sql="p.sort_order ASC, p.product_id ASC",
                )
            finally:
                conn.close()

        def _score(row: dict) -> tuple[int, int, int, int]:
            candidates = [
                str(row.get("product_name") or ""),
                str(row.get("product_name_en") or ""),
                str(row.get("registration_name") or ""),
            ]
            best = 99
            for candidate in candidates:
                current = candidate.casefold()
                if not current:
                    continue
                if current == lowered:
                    best = min(best, 0)
                elif current.startswith(lowered):
                    best = min(best, 1)
                elif lowered in current:
                    best = min(best, 2)
            return (
                best,
                int(row.get("hall_id") != ""),
                int(row.get("sort_order") or 0),
                0,
            )

        rows.sort(
            key=lambda row: (
                _score(row)[0],
                int(row.get("sort_order") or 0),
                str(row.get("product_id") or ""),
            )
        )
        return rows[: max(1, int(limit or 20))]

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
                        SELECT p.updated_at_ms
                        FROM hall_products p
                        WHERE p.hall_id<>?
                          AND EXISTS (
                              SELECT 1
                              FROM pad_hall_station_hotspots h
                              WHERE h.hall_id=?
                                AND h.product_id = p.product_id
                          )
                        UNION ALL
                        SELECT a.updated_at_ms
                        FROM product_audio_assets a
                        JOIN hall_products p ON p.product_id = a.product_id
                        WHERE p.hall_id<>?
                          AND EXISTS (
                              SELECT 1
                              FROM pad_hall_station_hotspots h
                              WHERE h.hall_id=?
                                AND h.product_id = p.product_id
                          )
                        UNION ALL
                        SELECT i.updated_at_ms
                        FROM product_image_assets i
                        JOIN hall_products p ON p.product_id = i.product_id
                        WHERE p.hall_id<>?
                          AND EXISTS (
                              SELECT 1
                              FROM pad_hall_station_hotspots h
                              WHERE h.hall_id=?
                                AND h.product_id = p.product_id
                          )
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
                        FROM pad_station_narration_nodes
                        WHERE hall_id=?
                        UNION ALL
                        SELECT updated_at_ms
                        FROM pad_display_bindings
                        WHERE hall_id=?
                    )
                    """,
                    (hid, hid, hid, hid, hid, hid, hid, hid, hid, hid, hid, hid, hid, hid, hid, hid, hid),
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
        if not str(rel_path or "").strip():
            raise ValueError("rel_path_required")
        rel = _normalize_rel_path(rel_path)
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
        if not str(rel_path or "").strip():
            raise ValueError("rel_path_required")
        rel = _normalize_rel_path(rel_path)
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
        mimetype = str(background_mimetype or "").strip()
        if not sid:
            raise ValueError("scene_id_required")
        if not hid:
            raise ValueError("hall_id_required")
        if not scene_name:
            raise ValueError("scene_name_required")
        if not str(background_rel_path or "").strip():
            raise ValueError("background_rel_path_required")
        rel = _normalize_rel_path(background_rel_path)
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
        mimetype = str(background_mimetype or "").strip()
        if not sid:
            raise ValueError("scene_id_required")
        if not str(background_rel_path or "").strip():
            raise ValueError("background_rel_path_required")
        rel = _normalize_rel_path(background_rel_path)
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

    def get_station_config(self, *, hall_id: str, station_key: str) -> dict | None:
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
            return None
        item = self._station_config_defaults(hall_id=hid, station_key=key)
        item.update(dict(row))
        return item

    def list_station_configs(self, *, hall_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        if not hid:
            return []
        catalog = self.list_hall_stations(hall_id=hid)
        items: list[dict] = []
        for item in catalog:
            station = self.get_station_config(hall_id=hid, station_key=str(item.get("station_id") or ""))
            if station:
                items.append(station)
        return items

    def list_display_station_configs(self, *, client_id: str) -> list[dict]:
        binding = self.get_display_binding(client_id, enabled_only=True)
        if not binding:
            return []
        hall_id = str(binding.get("hall_id") or "").strip()
        items: list[dict] = []
        for slot_key, station_id in self.resolve_display_station_ids(client_id=client_id):
            station = self.get_station_config(hall_id=hall_id, station_key=station_id)
            if not station:
                raise ValueError("station_config_not_found")
            station["slot_key"] = slot_key
            station["station_id"] = station_id
            narration_state = self.get_station_narration_nodes_state(hall_id=hall_id, station_id=station_id)
            station["narration_nodes"] = narration_state["narration_nodes"]
            station["narration_nodes_error"] = narration_state["narration_nodes_error"]
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
        current = self.get_station_config(hall_id=hid, station_key=key) or self._station_config_defaults(hall_id=hid, station_key=key)
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
        self._ensure_default_control_hotspots(hall_id=hid, station_key=key)
        updated = self.get_station_config(hall_id=hid, station_key=key)
        if not updated:
            raise RuntimeError("station_config_insert_failed")
        return updated

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
        current = self.get_station_config(hall_id=hid, station_key=key) or self._station_config_defaults(hall_id=hid, station_key=key)
        now_ms = self._now_ms()
        next_background_rel_path = _normalize_optional_rel_path(
            background_rel_path,
            str(current.get("background_rel_path") or ""),
        )
        next_background_mimetype = str(background_mimetype) if background_mimetype is not None else str(current.get("background_mimetype") or "")
        next_wireframe_rel_path = _normalize_optional_rel_path(
            wireframe_rel_path,
            str(current.get("wireframe_rel_path") or ""),
        )
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
        self._ensure_default_control_hotspots(hall_id=hid, station_key=key)
        updated = self.get_station_config(hall_id=hid, station_key=key)
        if not updated:
            raise RuntimeError("station_config_insert_failed")
        return updated

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
                      h.hotspot_id,
                      h.hall_id,
                      h.station_key,
                      h.product_id,
                      h.sort_order,
                      h.x_pct,
                      h.y_pct,
                      h.width_pct,
                      h.height_pct,
                      h.created_at_ms,
                      h.updated_at_ms,
                      p.hall_id AS product_hall_id,
                      p.product_name,
                      p.product_name_en,
                      p.product_source,
                      a.audio_asset_id AS active_audio_asset_id,
                      a.updated_at_ms AS active_audio_updated_at_ms
                    FROM pad_hall_station_hotspots h
                    LEFT JOIN hall_products p ON p.product_id = h.product_id
                    LEFT JOIN product_audio_assets a
                      ON a.product_id = p.product_id
                     AND a.is_active = 1
                    WHERE h.hall_id=? AND h.station_key=?
                    ORDER BY h.sort_order ASC, h.hotspot_id ASC
                    """,
                    (hid, key),
                ).fetchall()
                out = []
                for row in rows:
                    item = dict(row)
                    pid = str(item.get("product_id") or "").strip()
                    if _is_control_hotspot_product_id(pid):
                        item["control_label"] = str(CONTROL_HOTSPOT_SPECS[pid]["label"])
                    out.append(item)
                return out
            finally:
                conn.close()

    def list_exportable_station_hotspots(self, *, hall_id: str, station_key: str) -> list[dict]:
        items = self.list_station_hotspots(hall_id=hall_id, station_key=station_key)
        out: list[dict] = []
        for item in items:
            product_id = str(item.get("product_id") or "").strip()
            manual_product_name = ""
            if not _is_control_hotspot_product_id(product_id) and _is_manual_placeholder_product_source(item.get("product_source")):
                manual_product_name = str(item.get("product_name") or "").strip()
            out.append(
                {
                    "product_id": product_id,
                    "manual_product_name": manual_product_name,
                    "sort_order": int(item.get("sort_order") or 0),
                    "x_pct": float(item.get("x_pct") or 0),
                    "y_pct": float(item.get("y_pct") or 0),
                    "width_pct": float(item.get("width_pct") or 0),
                    "height_pct": float(item.get("height_pct") or 0),
                }
            )
        return out

    def replace_station_hotspots(
        self,
        *,
        hall_id: str,
        station_key: str,
        hotspots: list[dict],
    ) -> list[dict]:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        if not hid:
            raise ValueError("hall_id_required")
        if not isinstance(hotspots, list):
            raise ValueError("hotspots_must_be_list")

        normalized: list[dict] = []
        for raw in hotspots:
            item = raw if isinstance(raw, dict) else {}
            product_id = str(item.get("product_id") or "").strip()
            manual_product_name = str(item.get("manual_product_name") or "").strip()
            if not product_id and not manual_product_name:
                raise ValueError("product_binding_required")
            x_value, y_value, width_value, height_value = _normalize_hotspot_geometry(
                x_pct=item.get("x_pct"),
                y_pct=item.get("y_pct"),
                width_pct=item.get("width_pct"),
                height_pct=item.get("height_pct"),
            )
            try:
                sort_order = int(item.get("sort_order") or 0)
            except Exception as exc:
                raise ValueError("sort_order_invalid") from exc
            if _is_control_hotspot_product_id(product_id):
                resolved_product_id = product_id
            else:
                resolved_product_id = self._resolve_station_hotspot_product_id(
                    hall_id=hid,
                    product_id=product_id,
                    manual_product_name=manual_product_name,
                )
            if not resolved_product_id:
                raise ValueError("product_binding_required")
            normalized.append(
                {
                    "product_id": resolved_product_id,
                    "sort_order": sort_order,
                    "x_pct": x_value,
                    "y_pct": y_value,
                    "width_pct": width_value,
                    "height_pct": height_value,
                }
            )

        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    DELETE FROM pad_hall_station_hotspots
                    WHERE hall_id=? AND station_key=?
                    """,
                    (hid, key),
                )
                for item in normalized:
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
                            f"station_hotspot_{uuid.uuid4().hex}",
                            hid,
                            key,
                            item["product_id"],
                            int(item["sort_order"]),
                            float(item["x_pct"]),
                            float(item["y_pct"]),
                            float(item["width_pct"]),
                            float(item["height_pct"]),
                            int(now_ms),
                            int(now_ms),
                        ),
                    )
                conn.commit()
            finally:
                conn.close()
        return self.list_station_hotspots(hall_id=hid, station_key=key)

    def _resolve_station_hotspot_product_id(
        self,
        *,
        hall_id: str,
        product_id: str,
        manual_product_name: str,
    ) -> str:
        pid = str(product_id or "").strip()
        if pid:
            if _is_control_hotspot_product_id(pid):
                return pid
            product = self.get_product(pid)
            if not product:
                raise ValueError("product_not_found")
            return pid
        manual_name = str(manual_product_name or "").strip()
        if manual_name:
            created = self.create_manual_placeholder_product(hall_id=hall_id, product_name=manual_name)
            return str(created.get("product_id") or "")
        return ""

    def _ensure_default_control_hotspots(self, *, hall_id: str, station_key: str) -> None:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        if not hid:
            return
        now_ms = self._now_ms()
        with self._lock:
            conn = self._connect()
            try:
                existing_rows = conn.execute(
                    """
                    SELECT product_id
                    FROM pad_hall_station_hotspots
                    WHERE hall_id=? AND station_key=? AND product_id IN ({placeholders})
                    """.format(placeholders=",".join("?" for _ in CONTROL_HOTSPOT_SPECS)),
                    (hid, key, *CONTROL_HOTSPOT_SPECS.keys()),
                ).fetchall()
                existing = {str(row["product_id"] or "").strip() for row in existing_rows}
                for product_id, spec in CONTROL_HOTSPOT_SPECS.items():
                    if product_id in existing:
                        continue
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
                            f"station_hotspot_{uuid.uuid4().hex}",
                            hid,
                            key,
                            product_id,
                            int(spec["sort_order"]),
                            float(spec["x_pct"]),
                            float(spec["y_pct"]),
                            float(spec["width_pct"]),
                            float(spec["height_pct"]),
                            int(now_ms),
                            int(now_ms),
                        ),
                    )
                conn.commit()
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
                      h.hotspot_id,
                      h.hall_id,
                      h.station_key,
                      h.product_id,
                      h.sort_order,
                      h.x_pct,
                      h.y_pct,
                      h.width_pct,
                      h.height_pct,
                      h.created_at_ms,
                      h.updated_at_ms,
                      p.hall_id AS product_hall_id,
                      p.product_name,
                      p.product_name_en,
                      p.product_source,
                      a.audio_asset_id AS active_audio_asset_id,
                      a.updated_at_ms AS active_audio_updated_at_ms
                    FROM pad_hall_station_hotspots h
                    LEFT JOIN hall_products p ON p.product_id = h.product_id
                    LEFT JOIN product_audio_assets a
                      ON a.product_id = p.product_id
                     AND a.is_active = 1
                    WHERE h.hotspot_id=?
                    LIMIT 1
                    """,
                    (hid,),
                ).fetchone()
                item = dict(row) if row else None
                pid = str(item.get("product_id") or "").strip() if item else ""
                if item and _is_control_hotspot_product_id(pid):
                    item["control_label"] = str(CONTROL_HOTSPOT_SPECS[pid]["label"])
                return item
            finally:
                conn.close()

    def create_station_hotspot(
        self,
        *,
        hall_id: str,
        station_key: str,
        product_id: str,
        manual_product_name: str = "",
        sort_order: int,
        x_pct,
        y_pct,
        width_pct,
        height_pct,
    ) -> dict:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        if not hid:
            raise ValueError("hall_id_required")
        pid = self._resolve_station_hotspot_product_id(
            hall_id=hid,
            product_id=product_id,
            manual_product_name=manual_product_name,
        )
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
                        pid or None,
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
        self._ensure_default_control_hotspots(hall_id=hid, station_key=key)
        return self.get_station_hotspot(hotspot_id) or {}

    def update_station_hotspot(
        self,
        *,
        hall_id: str,
        station_key: str,
        hotspot_id: str,
        product_id: str,
        manual_product_name: str = "",
        sort_order: int,
        x_pct,
        y_pct,
        width_pct,
        height_pct,
    ) -> dict:
        hid = str(hall_id or "").strip()
        key = _normalize_station_key(station_key)
        hotspot_key = str(hotspot_id or "").strip()
        if not hid:
            raise ValueError("hall_id_required")
        if not hotspot_key:
            raise ValueError("hotspot_id_required")
        hotspot = self.get_station_hotspot(hotspot_key)
        if not hotspot or str(hotspot.get("hall_id") or "") != hid or str(hotspot.get("station_key") or "") != key:
            raise ValueError("hotspot_not_found")
        pid = self._resolve_station_hotspot_product_id(
            hall_id=hid,
            product_id=product_id,
            manual_product_name=manual_product_name,
        )
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
                        pid or None,
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

    def _list_station_narration_nodes_direct(self, *, hall_id: str, station_id: str) -> list[dict]:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            raise ValueError("hall_id_required")
        with self._lock:
            conn = self._connect()
            try:
                node_rows = conn.execute(
                    """
                    SELECT
                      node_id,
                      hall_id,
                      station_id,
                      sort_order,
                      recording_id,
                      stop_index,
                      stop_name,
                      highlight_start_ms,
                      highlight_end_ms,
                      created_at_ms,
                      updated_at_ms
                    FROM pad_station_narration_nodes
                    WHERE hall_id=? AND station_id=?
                    ORDER BY sort_order ASC, highlight_start_ms ASC, node_id ASC
                    """,
                    (hid, sid),
                ).fetchall()
                hotspot_rows = conn.execute(
                    """
                    SELECT
                      node_id,
                      station_hotspot_id,
                      sort_order
                    FROM pad_station_narration_node_hotspots
                    WHERE hall_id=? AND station_id=?
                    ORDER BY node_id ASC, sort_order ASC, station_hotspot_id ASC
                    """,
                    (hid, sid),
                ).fetchall()
            finally:
                conn.close()
        hotspot_map: dict[str, list[str]] = {}
        for row in hotspot_rows:
            node_id = str(row["node_id"] or "")
            if not node_id:
                continue
            hotspot_map.setdefault(node_id, []).append(str(row["station_hotspot_id"] or ""))
        items: list[dict] = []
        for row in node_rows:
            item = dict(row)
            item["hotspot_ids"] = [hid for hid in hotspot_map.get(str(item.get("node_id") or ""), []) if hid]
            items.append(item)
        return items

    def _delete_station_narration_nodes(self, *, conn: sqlite3.Connection, hall_id: str, station_id: str) -> None:
        conn.execute(
            "DELETE FROM pad_station_narration_node_hotspots WHERE hall_id=? AND station_id=?",
            (hall_id, station_id),
        )
        conn.execute(
            "DELETE FROM pad_station_narration_nodes WHERE hall_id=? AND station_id=?",
            (hall_id, station_id),
        )

    def _build_narration_nodes_from_legacy_events(self, *, hall_id: str, station_id: str, events: list[dict]) -> list[dict]:
        if not isinstance(events, list) or not events:
            return []
        station_cfg = self.get_station_config(hall_id=hall_id, station_key=station_id)
        if not station_cfg:
            raise ValueError("station_config_not_found")
        recording_id = str(station_cfg.get("recording_id") or "").strip()
        stop_index = station_cfg.get("stop_index")
        stop_name = str(station_cfg.get("stop_name") or "").strip()
        if not recording_id or stop_index is None or str(stop_index).strip() == "":
            raise ValueError("legacy_timeline_station_audio_missing")
        sorted_events = sorted(
            [item if isinstance(item, dict) else {} for item in events],
            key=lambda item: (
                int(item.get("sort_order") if item.get("sort_order") is not None else 0),
                int(item.get("time_ms") if item.get("time_ms") is not None else 0),
                str(item.get("event_id") or ""),
            ),
        )
        pending: dict[str, dict] = {}
        grouped: dict[tuple[int, int], dict] = {}
        for raw in sorted_events:
            event_type = str(raw.get("event_type") or "focus_switch").strip() or "focus_switch"
            if event_type == "focus_switch":
                raise ValueError("legacy_timeline_focus_switch_unsupported")
            if event_type not in {"highlight_on", "highlight_off"}:
                raise ValueError("legacy_timeline_event_type_invalid")
            hotspot_id = str(raw.get("station_hotspot_id") or raw.get("hotspot_id") or "").strip()
            if not hotspot_id:
                raise ValueError("legacy_timeline_station_hotspot_missing")
            try:
                time_ms = int(raw.get("time_ms"))
            except Exception as exc:
                raise ValueError("legacy_timeline_time_ms_invalid") from exc
            if time_ms < 0:
                raise ValueError("legacy_timeline_time_ms_invalid")
            if event_type == "highlight_on":
                if hotspot_id in pending:
                    raise ValueError("legacy_timeline_highlight_unpaired")
                pending[hotspot_id] = {"hotspot_id": hotspot_id, "start_ms": time_ms}
                continue
            start = pending.pop(hotspot_id, None)
            if not start:
                raise ValueError("legacy_timeline_highlight_unpaired")
            start_ms = int(start["start_ms"])
            if time_ms <= start_ms:
                raise ValueError("legacy_timeline_highlight_invalid")
            group_key = (start_ms, time_ms)
            grouped_item = grouped.get(group_key)
            if not grouped_item:
                grouped_item = {
                    "recording_id": recording_id,
                    "stop_index": int(stop_index),
                    "stop_name": stop_name,
                    "highlight_start_ms": start_ms,
                    "highlight_end_ms": time_ms,
                    "hotspot_ids": [],
                }
                grouped[group_key] = grouped_item
            if hotspot_id not in grouped_item["hotspot_ids"]:
                grouped_item["hotspot_ids"].append(hotspot_id)
        if pending:
            raise ValueError("legacy_timeline_highlight_unpaired")
        items: list[dict] = []
        for index, group_key in enumerate(sorted(grouped.keys(), key=lambda item: (item[0], item[1]))):
            item = grouped[group_key]
            items.append(
                {
                    "node_id": f"narration_node_{uuid.uuid4().hex}",
                    "hall_id": hall_id,
                    "station_id": station_id,
                    "sort_order": index,
                    "recording_id": item["recording_id"],
                    "stop_index": int(item["stop_index"]),
                    "stop_name": item["stop_name"],
                    "highlight_start_ms": int(item["highlight_start_ms"]),
                    "highlight_end_ms": int(item["highlight_end_ms"]),
                    "hotspot_ids": list(item["hotspot_ids"]),
                    "created_at_ms": 0,
                    "updated_at_ms": 0,
                }
            )
        return items

    def _persist_station_narration_nodes(self, *, hall_id: str, station_id: str, nodes: list[dict]) -> list[dict]:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            raise ValueError("hall_id_required")
        now_ms = self._now_ms()
        normalized: list[dict] = []
        hotspot_map = {
            str(item.get("hotspot_id") or ""): item
            for item in self.list_station_hotspots(hall_id=hid, station_key=sid)
        }
        for index, raw in enumerate(nodes):
            item = raw if isinstance(raw, dict) else {}
            node_id = str(item.get("node_id") or "").strip() or f"narration_node_{uuid.uuid4().hex}"
            recording_id = str(item.get("recording_id") or "").strip()
            if not recording_id:
                raise ValueError("narration_node_recording_required")
            try:
                stop_index = int(item.get("stop_index"))
            except Exception as exc:
                raise ValueError("narration_node_stop_index_invalid") from exc
            if stop_index < 0:
                raise ValueError("narration_node_stop_index_invalid")
            try:
                start_ms = int(item.get("highlight_start_ms"))
                end_ms = int(item.get("highlight_end_ms"))
            except Exception as exc:
                raise ValueError("narration_node_highlight_invalid") from exc
            if start_ms < 0 or end_ms <= start_ms:
                raise ValueError("narration_node_highlight_invalid")
            raw_hotspot_ids = item.get("hotspot_ids")
            if not isinstance(raw_hotspot_ids, list):
                raise ValueError("narration_node_hotspots_required")
            deduped_hotspot_ids: list[str] = []
            seen_hotspots: set[str] = set()
            for hotspot_id in raw_hotspot_ids:
                next_hotspot_id = str(hotspot_id or "").strip()
                if not next_hotspot_id or next_hotspot_id in seen_hotspots:
                    continue
                seen_hotspots.add(next_hotspot_id)
                hotspot = hotspot_map.get(next_hotspot_id)
                if not hotspot:
                    raise ValueError("station_hotspot_not_found")
                deduped_hotspot_ids.append(next_hotspot_id)
            if not deduped_hotspot_ids:
                raise ValueError("narration_node_hotspots_required")
            normalized.append(
                {
                    "node_id": node_id,
                    "hall_id": hid,
                    "station_id": sid,
                    "sort_order": int(item.get("sort_order") if item.get("sort_order") is not None else index),
                    "recording_id": recording_id,
                    "stop_index": stop_index,
                    "stop_name": str(item.get("stop_name") or "").strip(),
                    "highlight_start_ms": start_ms,
                    "highlight_end_ms": end_ms,
                    "hotspot_ids": deduped_hotspot_ids,
                    "created_at_ms": int(item.get("created_at_ms") or now_ms),
                    "updated_at_ms": int(now_ms),
                }
            )
        with self._lock:
            conn = self._connect()
            try:
                self._delete_station_narration_nodes(conn=conn, hall_id=hid, station_id=sid)
                conn.execute(
                    "DELETE FROM pad_station_narration_timeline_events WHERE hall_id=? AND station_id=?",
                    (hid, sid),
                )
                for node in normalized:
                    conn.execute(
                        """
                        INSERT INTO pad_station_narration_nodes (
                            node_id, hall_id, station_id, sort_order, recording_id, stop_index,
                            stop_name, highlight_start_ms, highlight_end_ms, created_at_ms, updated_at_ms
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            node["node_id"],
                            node["hall_id"],
                            node["station_id"],
                            node["sort_order"],
                            node["recording_id"],
                            node["stop_index"],
                            node["stop_name"],
                            node["highlight_start_ms"],
                            node["highlight_end_ms"],
                            node["created_at_ms"],
                            node["updated_at_ms"],
                        ),
                    )
                    for hotspot_index, hotspot_id in enumerate(node["hotspot_ids"]):
                        conn.execute(
                            """
                            INSERT INTO pad_station_narration_node_hotspots (
                                node_id, hall_id, station_id, station_hotspot_id, sort_order
                            )
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (
                                node["node_id"],
                                node["hall_id"],
                                node["station_id"],
                                hotspot_id,
                                hotspot_index,
                            ),
                        )
                conn.commit()
            finally:
                conn.close()
        return self._list_station_narration_nodes_direct(hall_id=hid, station_id=sid)

    def get_station_narration_nodes_state(self, *, hall_id: str, station_id: str) -> dict:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            raise ValueError("hall_id_required")
        direct_nodes = self._list_station_narration_nodes_direct(hall_id=hid, station_id=sid)
        if direct_nodes:
            return {"narration_nodes": direct_nodes, "narration_nodes_error": ""}
        legacy_events = self.list_station_narration_timeline_events(hall_id=hid, station_id=sid)
        if not legacy_events:
            return {"narration_nodes": [], "narration_nodes_error": ""}
        migrated_nodes = self._build_narration_nodes_from_legacy_events(
            hall_id=hid,
            station_id=sid,
            events=legacy_events,
        )
        persisted = self._persist_station_narration_nodes(hall_id=hid, station_id=sid, nodes=migrated_nodes)
        return {"narration_nodes": persisted, "narration_nodes_error": ""}

    def list_station_narration_nodes(self, *, hall_id: str, station_id: str) -> list[dict]:
        return self.get_station_narration_nodes_state(hall_id=hall_id, station_id=station_id)["narration_nodes"]

    def replace_station_narration_nodes(self, *, hall_id: str, station_id: str, nodes: list[dict]) -> list[dict]:
        hid = str(hall_id or "").strip()
        sid = _normalize_station_id(station_id)
        if not hid:
            raise ValueError("hall_id_required")
        if not isinstance(nodes, list):
            raise ValueError("narration_nodes_must_be_list")
        if not nodes:
            narration_state = self.get_station_narration_nodes_state(hall_id=hid, station_id=sid)
            if str(narration_state.get("narration_nodes_error") or "").strip():
                raise ValueError(str(narration_state.get("narration_nodes_error") or "legacy_timeline_manual_cleanup_required"))
        return self._persist_station_narration_nodes(hall_id=hid, station_id=sid, nodes=nodes)

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
