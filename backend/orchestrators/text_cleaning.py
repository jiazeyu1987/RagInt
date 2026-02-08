from __future__ import annotations

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
        text_cleaning = {}

    def _safe_int(v, d: int) -> int:
        try:
            return int(v)
        except Exception:
            return int(d)

    def _safe_float(v, d: float) -> float:
        try:
            return float(v)
        except Exception:
            return float(d)

    enabled = bool(text_cleaning.get("enabled", False))
    cleaning_level = str(text_cleaning.get("cleaning_level", "standard") or "standard")
    language = str(text_cleaning.get("language", "zh-CN") or "zh-CN")
    tts_buffer_enabled = bool(text_cleaning.get("tts_buffer_enabled", True))
    max_chunk_size = max(1, _safe_int(text_cleaning.get("max_chunk_size", 200), 200))
    start_tts_on_first_chunk = bool(text_cleaning.get("start_tts_on_first_chunk", True))
    first_segment_min_chars = max(0, _safe_int(text_cleaning.get("first_segment_min_chars", 10), 10))
    segment_flush_interval_s = max(0.0, _safe_float(text_cleaning.get("segment_flush_interval_s", 0.8), 0.8))
    segment_min_chars = max(0, _safe_int(text_cleaning.get("segment_min_chars", first_segment_min_chars), first_segment_min_chars))

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
    try:
        from ragflow_demo.text_cleaner import TTSTextCleaner
        from ragflow_demo.tts_buffer import TTSBuffer

        text_cleaner = TTSTextCleaner(language=cfg.language, cleaning_level=cfg.cleaning_level)
        tts_buffer = TTSBuffer(max_chunk_size=cfg.max_chunk_size, language=cfg.language) if cfg.tts_buffer_enabled else None
        return text_cleaner, tts_buffer, True
    except Exception as e:
        logger.warning(f"文本清洗/分段模块不可用，降级为整段TTS: {e}")
        return None, None, False

