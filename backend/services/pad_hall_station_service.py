from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from backend.services.pad_product_image_service import (
    SUPPORTED_IMAGE_MIMETYPES,
    _detect_image_dimensions,
    _detect_image_mimetype,
    _guess_extension,
    _safe_file_part,
)


class PadHallStationService:
    def __init__(self, *, store, logger: logging.Logger | None = None):
        self._store = store
        self._logger = logger or logging.getLogger(__name__)

    def _write_station_asset_bytes(self, *, hall_id: str, station_key: str, filename: str, image_bytes: bytes) -> tuple[str, Path]:
        rel_path = self._store.build_station_asset_rel_path(hall_id=hall_id, station_key=station_key, filename=filename)
        final_path = self._store.resolve_image_rel_path(rel_path)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = final_path.with_suffix(final_path.suffix + ".part")
        with open(tmp_path, "wb") as handle:
            handle.write(bytes(image_bytes or b""))
        os.replace(str(tmp_path), str(final_path))
        return rel_path, final_path

    def _prepare_upload(self, *, filename: str, image_bytes: bytes, mimetype: str) -> tuple[bytes, str, int, int, str]:
        payload = bytes(image_bytes or b"")
        if not payload:
            raise ValueError("image_file_empty")
        detected_mimetype = _detect_image_mimetype(filename=filename, image_bytes=payload)
        if detected_mimetype not in SUPPORTED_IMAGE_MIMETYPES:
            raise ValueError("image_format_unsupported")
        width, height = _detect_image_dimensions(filename=filename, image_bytes=payload)
        ext = _guess_extension(filename=filename, mimetype=detected_mimetype)
        return payload, detected_mimetype, width, height, ext

    def upload_station_background(
        self,
        *,
        hall_id: str,
        station_key: str,
        filename: str,
        image_bytes: bytes,
        mimetype: str = "",
    ) -> dict:
        current = self._store.get_station_config(hall_id=hall_id, station_key=station_key)
        if not current:
            raise ValueError("station_config_not_found")
        payload, detected_mimetype, width, height, ext = self._prepare_upload(
            filename=filename,
            image_bytes=image_bytes,
            mimetype=mimetype,
        )
        stored_name = f"station_bg_{_safe_file_part(station_key, field_name='station_key')}_{time.time_ns()}{ext}"
        rel_path, _ = self._write_station_asset_bytes(
            hall_id=hall_id,
            station_key=station_key,
            filename=stored_name,
            image_bytes=payload,
        )
        old_background = str(current.get("background_rel_path") or "").strip()
        updated = self._store.update_station_visual_assets(
            hall_id=hall_id,
            station_key=station_key,
            background_rel_path=rel_path,
            background_mimetype=detected_mimetype,
            base_width=width,
            base_height=height,
        )
        if old_background and old_background != rel_path:
            self._store.delete_image_rel_path(old_background)
        return updated

    def upload_station_wireframe(
        self,
        *,
        hall_id: str,
        station_key: str,
        filename: str,
        image_bytes: bytes,
        mimetype: str = "",
    ) -> dict:
        current = self._store.get_station_config(hall_id=hall_id, station_key=station_key)
        if not current:
            raise ValueError("station_config_not_found")
        expected_width = int(current.get("base_width") or 0)
        expected_height = int(current.get("base_height") or 0)
        if expected_width <= 0 or expected_height <= 0:
            raise ValueError("background_required_before_wireframe")
        payload, detected_mimetype, width, height, ext = self._prepare_upload(
            filename=filename,
            image_bytes=image_bytes,
            mimetype=mimetype,
        )
        if width != expected_width or height != expected_height:
            raise ValueError("wireframe_size_mismatch")
        stored_name = f"station_wireframe_{_safe_file_part(station_key, field_name='station_key')}_{time.time_ns()}{ext}"
        rel_path, _ = self._write_station_asset_bytes(
            hall_id=hall_id,
            station_key=station_key,
            filename=stored_name,
            image_bytes=payload,
        )
        old_wireframe = str(current.get("wireframe_rel_path") or "").strip()
        updated = self._store.update_station_visual_assets(
            hall_id=hall_id,
            station_key=station_key,
            wireframe_rel_path=rel_path,
            wireframe_mimetype=detected_mimetype,
        )
        if old_wireframe and old_wireframe != rel_path:
            self._store.delete_image_rel_path(old_wireframe)
        return updated
