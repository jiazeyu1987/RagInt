from __future__ import annotations

import logging
import os
import struct
import time
from pathlib import Path


def _safe_file_part(value: str, *, fallback: str = "file") -> str:
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


def _detect_image_mimetype(*, filename: str, image_bytes: bytes | None = None) -> str:
    head = bytes(image_bytes or b"")[:16]
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(head) >= 3 and head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "image/gif"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith(b"BM"):
        return "image/bmp"

    ext = str(Path(filename).suffix or "").strip().lower()
    if ext == ".png":
        return "image/png"
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if ext == ".gif":
        return "image/gif"
    if ext == ".webp":
        return "image/webp"
    if ext == ".bmp":
        return "image/bmp"
    return ""


def _guess_extension(*, filename: str, mimetype: str) -> str:
    ext = str(Path(filename).suffix or "").strip().lower()
    if ext:
        return ext
    mime = str(mimetype or "").strip().lower()
    if mime == "image/png":
        return ".png"
    if mime == "image/jpeg":
        return ".jpg"
    if mime == "image/gif":
        return ".gif"
    if mime == "image/webp":
        return ".webp"
    if mime == "image/bmp":
        return ".bmp"
    return ".bin"


def _detect_image_dimensions(*, filename: str, image_bytes: bytes | None = None) -> tuple[int, int]:
    payload = bytes(image_bytes or b"")
    head = payload[:64]
    if head.startswith(b"\x89PNG\r\n\x1a\n") and len(payload) >= 24:
        width, height = struct.unpack(">II", payload[16:24])
        return int(width), int(height)
    if (head.startswith(b"GIF87a") or head.startswith(b"GIF89a")) and len(payload) >= 10:
        width, height = struct.unpack("<HH", payload[6:10])
        return int(width), int(height)
    if head.startswith(b"BM") and len(payload) >= 26:
        dib_size = struct.unpack("<I", payload[14:18])[0]
        if dib_size >= 12 and len(payload) >= 26:
            if dib_size == 12 and len(payload) >= 26:
                width, height = struct.unpack("<HH", payload[18:22])
                return int(width), int(height)
            if len(payload) >= 26:
                width, height = struct.unpack("<ii", payload[18:26])
                return abs(int(width)), abs(int(height))
    if len(head) >= 30 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        chunk = head[12:16]
        if chunk == b"VP8 " and len(payload) >= 30:
            width = struct.unpack("<H", payload[26:28])[0] & 0x3FFF
            height = struct.unpack("<H", payload[28:30])[0] & 0x3FFF
            return int(width), int(height)
        if chunk == b"VP8L" and len(payload) >= 25:
            bits = int.from_bytes(payload[21:25], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
            return int(width), int(height)
        if chunk == b"VP8X" and len(payload) >= 30:
            width = 1 + int.from_bytes(payload[24:27], "little")
            height = 1 + int.from_bytes(payload[27:30], "little")
            return int(width), int(height)
    if head[:2] == b"\xff\xd8":
        offset = 2
        length = len(payload)
        while offset + 9 < length:
            if payload[offset] != 0xFF:
                offset += 1
                continue
            marker = payload[offset + 1]
            offset += 2
            if marker in {0xD8, 0xD9}:
                continue
            if offset + 2 > length:
                break
            segment_length = struct.unpack(">H", payload[offset : offset + 2])[0]
            if segment_length < 2 or offset + segment_length > length:
                break
            if marker in {
                0xC0,
                0xC1,
                0xC2,
                0xC3,
                0xC5,
                0xC6,
                0xC7,
                0xC9,
                0xCA,
                0xCB,
                0xCD,
                0xCE,
                0xCF,
            } and segment_length >= 7:
                height, width = struct.unpack(">HH", payload[offset + 3 : offset + 7])
                return int(width), int(height)
            offset += segment_length
    ext = str(Path(filename).suffix or "").strip().lower()
    raise ValueError(f"image_dimensions_unsupported:{ext or 'unknown'}")


class PadProductImageService:
    def __init__(self, *, store, logger: logging.Logger | None = None):
        self._store = store
        self._logger = logger or logging.getLogger(__name__)

    def _write_image_bytes(self, *, product_id: str, filename: str, image_bytes: bytes) -> tuple[str, Path]:
        rel_path = self._store.build_image_rel_path(product_id=product_id, filename=filename)
        final_path = self._store.resolve_image_rel_path(rel_path)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = final_path.with_suffix(final_path.suffix + ".part")
        with open(tmp_path, "wb") as handle:
            handle.write(bytes(image_bytes or b""))
        os.replace(str(tmp_path), str(final_path))
        return rel_path, final_path

    def save_uploaded_image(
        self,
        *,
        product_id: str,
        filename: str,
        image_bytes: bytes,
        mimetype: str = "",
    ) -> dict:
        payload = bytes(image_bytes or b"")
        if not payload:
            raise ValueError("image_file_empty")
        detected_mimetype = _detect_image_mimetype(filename=filename, image_bytes=payload) or str(mimetype or "").strip().lower()
        if detected_mimetype not in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"}:
            raise ValueError("image_format_unsupported")
        ext = _guess_extension(filename=filename, mimetype=detected_mimetype)
        stored_name = f"image_{_safe_file_part(product_id, fallback='product')}_{int(time.time() * 1000)}{ext}"
        rel_path, _final_path = self._write_image_bytes(product_id=product_id, filename=stored_name, image_bytes=payload)
        return self._store.create_image_asset(
            product_id=product_id,
            rel_path=rel_path,
            mimetype=detected_mimetype,
        )
