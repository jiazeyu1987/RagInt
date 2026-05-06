from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class TextCleaningCfg:
    enabled: bool
    cleaning_level: str
    language: str
    tts_buffer_enabled: bool
    max_chunk_size: int
    start_tts_on_first_chunk: bool
    first_segment_min_chars: int
    segment_flush_interval_s: float
    segment_min_chars: int


def _parse_text_cleaning_cfg(ragflow_config: dict | None) -> TextCleaningCfg:
    text_cleaning = ragflow_config.get("text_cleaning", {}) if isinstance(ragflow_config, dict) else {}
    if not isinstance(text_cleaning, dict):
        raise ValueError("text_cleaning must be an object")

    def _number_field(key: str, *, default, cast):
        if key not in text_cleaning:
            return default
        raw = text_cleaning[key]
        if isinstance(raw, bool):
            raise ValueError(f"text_cleaning.{key} must be a number")
        if cast is int and isinstance(raw, float) and not raw.is_integer():
            raise ValueError(f"text_cleaning.{key} must be an integer")
        try:
            value = cast(raw)
        except (TypeError, ValueError) as e:
            raise ValueError(f"text_cleaning.{key} must be a number") from e
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError(f"text_cleaning.{key} must be a finite number")
        if cast is int and str(raw).strip().lower() in ("nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity"):
            raise ValueError(f"text_cleaning.{key} must be a finite number")
        return value

    def _min_value(key: str, value, minimum):
        if value < minimum:
            raise ValueError(f"text_cleaning.{key} must be >= {minimum}")
        return value

    enabled = bool(text_cleaning.get("enabled", False))
    cleaning_level = str(text_cleaning.get("cleaning_level", "standard") or "standard")
    language = str(text_cleaning.get("language", "zh-CN") or "zh-CN")
    tts_buffer_enabled = bool(text_cleaning.get("tts_buffer_enabled", True))
    max_chunk_size = _min_value("max_chunk_size", _number_field("max_chunk_size", default=200, cast=int), 1)
    start_tts_on_first_chunk = bool(text_cleaning.get("start_tts_on_first_chunk", True))
    first_segment_min_chars = _min_value(
        "first_segment_min_chars",
        _number_field("first_segment_min_chars", default=10, cast=int),
        0,
    )
    segment_flush_interval_s = _min_value(
        "segment_flush_interval_s",
        _number_field("segment_flush_interval_s", default=0.8, cast=float),
        0.0,
    )
    segment_min_chars = _min_value(
        "segment_min_chars",
        _number_field("segment_min_chars", default=first_segment_min_chars, cast=int),
        0,
    )

    return TextCleaningCfg(
        enabled=enabled,
        cleaning_level=cleaning_level,
        language=language,
        tts_buffer_enabled=tts_buffer_enabled,
        max_chunk_size=max_chunk_size,
        start_tts_on_first_chunk=start_tts_on_first_chunk,
        first_segment_min_chars=first_segment_min_chars,
        segment_flush_interval_s=segment_flush_interval_s,
        segment_min_chars=segment_min_chars,
    )


def _init_text_cleaning(cfg: TextCleaningCfg, *, logger):
    if not cfg.enabled:
        return None, None, False
    from ragflow_demo.text_cleaner import TTSTextCleaner
    from ragflow_demo.tts_buffer import TTSBuffer

    text_cleaner = TTSTextCleaner(language=cfg.language, cleaning_level=cfg.cleaning_level)
    tts_buffer = TTSBuffer(max_chunk_size=cfg.max_chunk_size, language=cfg.language) if cfg.tts_buffer_enabled else None
    return text_cleaner, tts_buffer, True

