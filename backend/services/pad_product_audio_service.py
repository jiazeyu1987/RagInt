from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path

from backend.services.audio_utils import ensure_wav_bytes


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


def _guess_sample_rate(*, resolved_cfg: dict, provider: str) -> int:
    cfg = resolved_cfg if isinstance(resolved_cfg, dict) else {}
    p = str(provider or "").strip().lower()
    if p in {"modelscope", "bailian", "dashscope", "flash"}:
        try:
            sample_rate = (((cfg.get("tts") or {}).get("bailian") or {}).get("sample_rate"))
            if sample_rate is not None and str(sample_rate).strip() != "":
                return max(8000, int(sample_rate))
        except Exception:
            pass
    if p == "edge":
        try:
            fmt = str((((cfg.get("tts") or {}).get("edge") or {}).get("output_format") or "")).strip().lower()
            if "24khz" in fmt:
                return 24000
            if "22khz" in fmt:
                return 22050
            if "16khz" in fmt:
                return 16000
            if "8khz" in fmt:
                return 8000
        except Exception:
            pass
    return 16000


def _detect_audio_mimetype(*, filename: str, audio_bytes: bytes | None = None, fallback: str = "application/octet-stream") -> str:
    head = bytes(audio_bytes or b"")[:16]
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"OggS"):
        return "audio/ogg"
    if head.startswith(b"fLaC"):
        return "audio/flac"
    if len(head) >= 3 and head[:3] == b"ID3":
        return "audio/mpeg"
    if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return "audio/mpeg"
    ext = str(Path(filename).suffix or "").strip().lower()
    if ext in {".wav", ".wave"}:
        return "audio/wav"
    if ext == ".mp3":
        return "audio/mpeg"
    if ext == ".ogg":
        return "audio/ogg"
    if ext == ".flac":
        return "audio/flac"
    return fallback


def _guess_extension(*, filename: str, mimetype: str) -> str:
    ext = str(Path(filename).suffix or "").strip().lower()
    if ext:
        return ext
    mime = str(mimetype or "").strip().lower()
    if mime == "audio/wav":
        return ".wav"
    if mime == "audio/mpeg":
        return ".mp3"
    if mime == "audio/ogg":
        return ".ogg"
    if mime == "audio/flac":
        return ".flac"
    return ".bin"


class PadProductAudioService:
    def __init__(self, *, store, tts_service, logger: logging.Logger | None = None):
        self._store = store
        self._tts_service = tts_service
        self._logger = logger or logging.getLogger(__name__)

    def _write_audio_bytes(self, *, product_id: str, filename: str, audio_bytes: bytes) -> tuple[str, Path]:
        rel_path = self._store.build_audio_rel_path(product_id=product_id, filename=filename)
        final_path = self._store.resolve_audio_rel_path(rel_path)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = final_path.with_suffix(final_path.suffix + ".part")
        with open(tmp_path, "wb") as handle:
            handle.write(bytes(audio_bytes or b""))
        os.replace(str(tmp_path), str(final_path))
        return rel_path, final_path

    def save_uploaded_audio(
        self,
        *,
        product_id: str,
        filename: str,
        audio_bytes: bytes,
        mimetype: str = "",
        text_snapshot: str = "",
        activate: bool = True,
    ) -> dict:
        payload = bytes(audio_bytes or b"")
        if not payload:
            raise ValueError("audio_file_empty")
        detected_mimetype = _detect_audio_mimetype(filename=filename, audio_bytes=payload, fallback=str(mimetype or "").strip())
        ext = _guess_extension(filename=filename, mimetype=detected_mimetype)
        stored_name = f"recorded_{_safe_file_part(product_id, fallback='product')}_{int(time.time() * 1000)}{ext}"
        rel_path, _final_path = self._write_audio_bytes(product_id=product_id, filename=stored_name, audio_bytes=payload)
        return self._store.create_audio_asset(
            product_id=product_id,
            source_type="recorded",
            text_snapshot=str(text_snapshot or "").strip(),
            rel_path=rel_path,
            mimetype=detected_mimetype,
            activate=activate,
        )

    def regenerate_product_audio(
        self,
        *,
        product_id: str,
        text: str,
        resolved_cfg: dict,
        provider: str,
        activate: bool = True,
    ) -> dict:
        intro_text = str(text or "").strip()
        if not intro_text:
            raise ValueError("intro_text_required")

        request_id = f"pad_tts_{_safe_file_part(product_id, fallback='product')}_{int(time.time() * 1000)}"
        chunks: list[bytes] = []
        for chunk in self._tts_service.stream(
            text=intro_text,
            request_id=request_id,
            config=resolved_cfg,
            provider=str(provider or "").strip() or "modelscope",
            endpoint="/api/pad/products/audio/regenerate",
            segment_index=0,
            cancel_event=threading.Event(),
        ):
            if chunk:
                chunks.append(bytes(chunk))

        if not chunks:
            raise RuntimeError("tts_empty_audio")

        raw_audio = b"".join(chunks)
        wav_bytes = ensure_wav_bytes(
            raw_audio,
            sample_rate=_guess_sample_rate(resolved_cfg=resolved_cfg, provider=provider),
            channels=1,
            bits_per_sample=16,
        )
        audio_payload = wav_bytes
        audio_mimetype = "audio/wav"
        if wav_bytes:
            ext = ".wav"
        else:
            audio_mimetype = _detect_audio_mimetype(filename="tts.bin", audio_bytes=raw_audio, fallback="")
            if not audio_mimetype:
                raise RuntimeError("tts_audio_format_unsupported")
            ext = _guess_extension(filename="tts", mimetype=audio_mimetype)
            audio_payload = raw_audio

        stored_name = f"tts_{_safe_file_part(product_id, fallback='product')}_{int(time.time() * 1000)}{ext}"
        rel_path, _final_path = self._write_audio_bytes(product_id=product_id, filename=stored_name, audio_bytes=audio_payload)
        return self._store.create_audio_asset(
            product_id=product_id,
            source_type="tts",
            text_snapshot=intro_text,
            rel_path=rel_path,
            mimetype=audio_mimetype,
            activate=activate,
        )
