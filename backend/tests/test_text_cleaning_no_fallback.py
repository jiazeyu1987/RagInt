from __future__ import annotations

import pytest

from backend.orchestrators.text_cleaning import TextCleaningCfg, _init_text_cleaning


class _Logger:
    def warning(self, message: str) -> None:
        raise AssertionError(f"unexpected warning fallback: {message}")


def test_disabled_text_cleaning_preserves_disabled_semantics():
    cfg = TextCleaningCfg(
        enabled=False,
        cleaning_level="standard",
        language="zh-CN",
        tts_buffer_enabled=True,
        max_chunk_size=200,
        start_tts_on_first_chunk=True,
        first_segment_min_chars=10,
        segment_flush_interval_s=0.8,
        segment_min_chars=10,
    )

    assert _init_text_cleaning(cfg, logger=_Logger()) == (None, None, False)


def test_enabled_text_cleaning_dependency_failure_is_not_downgraded():
    cfg = TextCleaningCfg(
        enabled=True,
        cleaning_level="standard",
        language="zh-CN",
        tts_buffer_enabled=True,
        max_chunk_size=200,
        start_tts_on_first_chunk=True,
        first_segment_min_chars=10,
        segment_flush_interval_s=0.8,
        segment_min_chars=10,
    )

    with pytest.raises(ModuleNotFoundError, match="ragflow_demo"):
        _init_text_cleaning(cfg, logger=_Logger())
