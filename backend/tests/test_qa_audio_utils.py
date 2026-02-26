from __future__ import annotations

from backend.services.qa_audio_utils import DEFAULT_CORE_ENTITY_TERMS
from backend.services.qa_audio_utils import detect_entity_conflict
from backend.services.qa_audio_utils import embed_question
from backend.services.qa_audio_utils import lexical_similarity
from backend.services.qa_audio_utils import parse_classification


def test_embed_question_is_deterministic():
    a = embed_question("9*0=?")
    b = embed_question("9*0=?")
    assert a.shape == b.shape
    assert float(((a - b) ** 2).sum()) == 0.0


def test_detect_entity_conflict_flags_different_core_terms():
    conflict, q_terms, c_terms = detect_entity_conflict(
        query="指引导丝有什么作用",
        candidate="指引导管有什么作用",
        core_terms=DEFAULT_CORE_ENTITY_TERMS,
    )
    assert conflict is True
    assert "导丝" in q_terms
    assert "导管" in c_terms


def test_parse_classification_handles_think_and_markdown_json():
    raw = (
        "<think>analysis</think>\n"
        "```json\n"
        '{"match": true, "candidate_id": 11, "confidence": 0.365, "reason": "same_intent"}\n'
        "```"
    )
    parsed = parse_classification(raw)
    assert parsed["match"] is True
    assert parsed["candidate_id"] == 11
    assert abs(float(parsed["confidence"]) - 0.365) < 1e-6
    assert lexical_similarity("9*0等于多少", "9*0=几?") > 0.2
