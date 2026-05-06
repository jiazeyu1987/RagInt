from __future__ import annotations

import pytest

from backend.orchestrators.ragflow_config import RagflowRuntimeConfig


def test_ragflow_runtime_config_parses_defaults():
    cfg = RagflowRuntimeConfig.from_any(None)
    assert cfg.kb_version == ""
    assert cfg.qa_cache.enabled is True
    assert cfg.qa_cache.ttl_s > 0
    assert cfg.qa_constraints.enabled is True
    assert cfg.qa_constraints.no_self_intro is True
    assert cfg.qa_constraints.max_answer_chars > 0
    assert cfg.qa_audio_cache.classifier_chat_name == "问题比对"
    assert cfg.text_cleaning.enabled is False


def test_ragflow_runtime_config_parses_values():
    raw = {
        "kb_version": "v1",
        "qa_cache": {"enabled": False, "ttl_s": 12},
        "qa_constraints": {"enabled": True, "no_self_intro": False, "max_answer_chars": 9},
        "qa_audio_cache": {"classifier_chat_name": "qa_cls"},
        "text_cleaning": {"enabled": True, "segment_min_chars": 7},
    }
    cfg = RagflowRuntimeConfig.from_any(raw)
    assert cfg.kb_version == "v1"
    assert cfg.qa_cache.enabled is False
    assert cfg.qa_cache.ttl_s == 12.0
    assert cfg.qa_constraints.enabled is True
    assert cfg.qa_constraints.no_self_intro is False
    assert cfg.qa_constraints.max_answer_chars == 9
    assert cfg.qa_audio_cache.classifier_chat_name == "qa_cls"
    assert cfg.text_cleaning.enabled is True
    assert cfg.text_cleaning.segment_min_chars == 7


def test_ragflow_runtime_config_rejects_non_object_config():
    with pytest.raises(ValueError, match="ragflow_config must be an object"):
        RagflowRuntimeConfig.from_any(["not", "an", "object"])


def test_ragflow_runtime_config_rejects_invalid_qa_cache_ttl():
    with pytest.raises(ValueError, match=r"qa_cache\.ttl_s must be a number"):
        RagflowRuntimeConfig.from_any({"qa_cache": {"ttl_s": "bad"}})


def test_ragflow_runtime_config_rejects_non_finite_qa_cache_ttl():
    with pytest.raises(ValueError, match=r"qa_cache\.ttl_s must be a finite number"):
        RagflowRuntimeConfig.from_any({"qa_cache": {"ttl_s": "NaN"}})


def test_ragflow_runtime_config_rejects_out_of_range_audio_cache_values_instead_of_clamping():
    with pytest.raises(ValueError, match=r"qa_audio_cache\.recall_top_k must be >= 1"):
        RagflowRuntimeConfig.from_any({"qa_audio_cache": {"recall_top_k": 0}})

    with pytest.raises(ValueError, match=r"qa_audio_cache\.recall_top_k must be an integer"):
        RagflowRuntimeConfig.from_any({"qa_audio_cache": {"recall_top_k": 1.5}})

    with pytest.raises(ValueError, match=r"qa_audio_cache\.classifier_threshold must be <= 1"):
        RagflowRuntimeConfig.from_any({"qa_audio_cache": {"classifier_threshold": 1.5}})


def test_ragflow_runtime_config_rejects_non_object_qa_audio_cache():
    with pytest.raises(ValueError, match="qa_audio_cache must be an object"):
        RagflowRuntimeConfig.from_any({"qa_audio_cache": "enabled"})


def test_ragflow_runtime_config_rejects_non_object_text_cleaning():
    with pytest.raises(ValueError, match="text_cleaning must be an object"):
        RagflowRuntimeConfig.from_any({"text_cleaning": "enabled"})


def test_ragflow_runtime_config_rejects_invalid_text_cleaning_number():
    with pytest.raises(ValueError, match=r"text_cleaning\.max_chunk_size must be a number"):
        RagflowRuntimeConfig.from_any({"text_cleaning": {"max_chunk_size": "bad"}})


def test_ragflow_runtime_config_rejects_bad_text_cleaning_ranges_instead_of_clamping():
    with pytest.raises(ValueError, match=r"text_cleaning\.max_chunk_size must be >= 1"):
        RagflowRuntimeConfig.from_any({"text_cleaning": {"max_chunk_size": 0}})

    with pytest.raises(ValueError, match=r"text_cleaning\.segment_min_chars must be an integer"):
        RagflowRuntimeConfig.from_any({"text_cleaning": {"segment_min_chars": 1.5}})

    with pytest.raises(ValueError, match=r"text_cleaning\.segment_flush_interval_s must be a finite number"):
        RagflowRuntimeConfig.from_any({"text_cleaning": {"segment_flush_interval_s": "inf"}})

