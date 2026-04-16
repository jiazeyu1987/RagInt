from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path

from backend.services.pad_product_image_service import (
    _detect_image_dimensions,
    _detect_image_mimetype,
    _guess_extension,
    _safe_file_part,
)


class PadHallSceneService:
    def __init__(self, *, store, logger: logging.Logger | None = None):
        self._store = store
        self._logger = logger or logging.getLogger(__name__)

    def _write_scene_background_bytes(self, *, hall_id: str, scene_id: str, filename: str, image_bytes: bytes) -> tuple[str, Path]:
        rel_path = self._store.build_scene_background_rel_path(hall_id=hall_id, scene_id=scene_id, filename=filename)
        final_path = self._store.resolve_image_rel_path(rel_path)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = final_path.with_suffix(final_path.suffix + ".part")
        with open(tmp_path, "wb") as handle:
            handle.write(bytes(image_bytes or b""))
        os.replace(str(tmp_path), str(final_path))
        return rel_path, final_path

    def create_scene(
        self,
        *,
        hall_id: str,
        name: str,
        sort_order: int,
        filename: str,
        image_bytes: bytes,
        mimetype: str = "",
    ) -> dict:
        payload = bytes(image_bytes or b"")
        if not payload:
            raise ValueError("image_file_empty")
        scene_id = f"scene_{uuid.uuid4().hex}"
        detected_mimetype = _detect_image_mimetype(filename=filename, image_bytes=payload) or str(mimetype or "").strip().lower()
        if detected_mimetype not in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"}:
            raise ValueError("image_format_unsupported")
        width, height = _detect_image_dimensions(filename=filename, image_bytes=payload)
        ext = _guess_extension(filename=filename, mimetype=detected_mimetype)
        stored_name = f"scene_bg_{_safe_file_part(scene_id, fallback='scene')}_{int(time.time() * 1000)}{ext}"
        rel_path, _ = self._write_scene_background_bytes(
            hall_id=hall_id,
            scene_id=scene_id,
            filename=stored_name,
            image_bytes=payload,
        )
        try:
            return self._store.create_hall_scene(
                scene_id=scene_id,
                hall_id=hall_id,
                name=name,
                sort_order=sort_order,
                background_rel_path=rel_path,
                background_mimetype=detected_mimetype,
                base_width=width,
                base_height=height,
            )
        except Exception:
            self._store.delete_image_rel_path(rel_path)
            self._store.delete_scene_background_dir(hall_id=hall_id, scene_id=scene_id)
            raise

    def replace_scene_background(
        self,
        *,
        scene_id: str,
        filename: str,
        image_bytes: bytes,
        mimetype: str = "",
    ) -> dict:
        scene = self._store.get_hall_scene(scene_id)
        if not scene:
            raise ValueError("scene_not_found")
        payload = bytes(image_bytes or b"")
        if not payload:
            raise ValueError("image_file_empty")
        detected_mimetype = _detect_image_mimetype(filename=filename, image_bytes=payload) or str(mimetype or "").strip().lower()
        if detected_mimetype not in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"}:
            raise ValueError("image_format_unsupported")
        width, height = _detect_image_dimensions(filename=filename, image_bytes=payload)
        ext = _guess_extension(filename=filename, mimetype=detected_mimetype)
        stored_name = f"scene_bg_{_safe_file_part(scene_id, fallback='scene')}_{int(time.time() * 1000)}{ext}"
        rel_path, _ = self._write_scene_background_bytes(
            hall_id=str(scene.get("hall_id") or ""),
            scene_id=scene_id,
            filename=stored_name,
            image_bytes=payload,
        )
        try:
            updated = self._store.update_hall_scene_background(
                scene_id=scene_id,
                background_rel_path=rel_path,
                background_mimetype=detected_mimetype,
                base_width=width,
                base_height=height,
            )
        except Exception:
            self._store.delete_image_rel_path(rel_path)
            raise
        old_rel_path = str(scene.get("background_rel_path") or "").strip()
        if old_rel_path and old_rel_path != rel_path:
            self._store.delete_image_rel_path(old_rel_path)
        return updated or {}

    def delete_scene(self, *, scene_id: str) -> dict | None:
        scene = self._store.delete_hall_scene(scene_id=scene_id)
        if not scene:
            return None
        background_rel_path = str(scene.get("background_rel_path") or "").strip()
        if background_rel_path:
            self._store.delete_image_rel_path(background_rel_path)
        self._store.delete_scene_background_dir(
            hall_id=str(scene.get("hall_id") or ""),
            scene_id=str(scene.get("scene_id") or ""),
        )
        return scene
