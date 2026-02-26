from __future__ import annotations

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

