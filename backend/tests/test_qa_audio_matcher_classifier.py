from __future__ import annotations

import pytest

from types import SimpleNamespace

from backend.services.qa_audio_matcher import QaAudioMatcher
from backend.services.qa_audio_matcher import TtsProfile


class _Store:
    def search_candidates(self, **kwargs):  # noqa: ANN003
        return []


class _Chunk:
    def __init__(self, content: str):
        self.content = content


class _Session:
    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        if stream:
            return iter([])
        return iter([_Chunk('{"match": true, "candidate_id": 1, "confidence": 0.9, "reason": "ok"}')])


class _SessionDictContent:
    class _Resp:
        def __init__(self):
            self.content = {"match": True, "candidate_id": 2, "confidence": 0.88, "reason": "dict_content"}

    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        if stream:
            return iter([])
        return self._Resp()


class _Ragflow:
    def get_session(self, _name: str):  # noqa: ARG002
        return _Session()


class _RagflowDict:
    def get_session(self, _name: str):  # noqa: ARG002
        return _SessionDictContent()


class _SessionCumulative:
    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        if stream:
            return iter([])
        return iter(
            [
                _Chunk("<think>planning...</think>"),
                _Chunk('<think>planning...</think>{"match": true'),
                _Chunk(
                    '<think>planning...</think>'
                    '{"match": true, "candidate_id": 11, "confidence": 0.99, "reason": "same_intent"}'
                ),
            ]
        )


class _RagflowCumulative:
    def get_session(self, _name: str):  # noqa: ARG002
        return _SessionCumulative()


class _SessionLowConfidenceJson:
    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        if stream:
            return iter([])
        return (
            "```json\n"
            '{ "match": true, "candidate_id": 11, "confidence": 0.365, '
            '"reason": "same_intent" }\n'
            "```"
        )


class _RagflowLowConfidence:
    def get_session(self, _name: str):  # noqa: ARG002
        return _SessionLowConfidenceJson()


class _SessionVeryLowConfidenceJson:
    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        if stream:
            return iter([])
        return (
            "```json\n"
            '{ "match": true, "candidate_id": 11, "confidence": 0.12, '
            '"reason": "same_intent_but_low_conf" }\n'
            "```"
        )


class _RagflowVeryLowConfidence:
    def get_session(self, _name: str):  # noqa: ARG002
        return _SessionVeryLowConfidenceJson()


class _SessionHighMismatchJson:
    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        if stream:
            return iter([])
        return (
            "```json\n"
            '{ "match": true, "candidate_id": 21, "confidence": 0.98, '
            '"reason": "looks_similar" }\n'
            "```"
        )


class _RagflowHighMismatch:
    def get_session(self, _name: str):  # noqa: ARG002
        return _SessionHighMismatchJson()


class _SessionInvalidJson:
    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        if stream:
            return iter([])
        return "classifier says probably yes without json"


class _RagflowInvalidJson:
    def get_session(self, _name: str):  # noqa: ARG002
        return _SessionInvalidJson()


class _RagflowBroken:
    def get_session(self, _name: str):  # noqa: ARG002
        raise RuntimeError("ragflow unavailable")


class _RagflowMissingSession:
    def get_session(self, _name: str):  # noqa: ARG002
        return None


class _Pair:
    def __init__(self, pid: int, question: str, answer: str):
        self.id = pid
        self.question_text = question
        self.answer_text = answer


class _StoreLowRecall:
    def __init__(self):
        self._pair = _Pair(11, "9*0等于多少", "答案是0。")

    def find_exact_pair(self, **kwargs):  # noqa: ANN003
        return None

    def search_candidates(self, **kwargs):  # noqa: ANN003
        return [SimpleNamespace(pair_id=11, question_text="9*0等于多少", score=0.2)]

    def get_pair(self, *, pair_id: int):
        return self._pair if int(pair_id) == 11 else None

    def get_audio_file_path(self, *, pair_id: int):
        return "dummy.wav" if int(pair_id) == 11 else None

    def audio_url_for_pair(self, *, base_url: str, pair_id: int) -> str:
        return f"{str(base_url).rstrip('/')}/api/qa_audio_cache/audio/{int(pair_id)}"


class _StoreEntityMismatch:
    def __init__(self):
        self._pair = _Pair(21, "\u6307\u5f15\u5bfc\u7ba1\u6709\u4ec0\u4e48\u4f5c\u7528", "\u5bfc\u7ba1\u7b54\u6848")

    def find_exact_pair(self, **kwargs):  # noqa: ANN003
        return None

    def search_candidates(self, **kwargs):  # noqa: ANN003
        return [SimpleNamespace(pair_id=21, question_text=self._pair.question_text, score=0.95)]

    def get_pair(self, *, pair_id: int):
        return self._pair if int(pair_id) == 21 else None

    def get_audio_file_path(self, *, pair_id: int):
        return "dummy.wav" if int(pair_id) == 21 else None

    def audio_url_for_pair(self, *, base_url: str, pair_id: int) -> str:
        return f"{str(base_url).rstrip('/')}/api/qa_audio_cache/audio/{int(pair_id)}"


class _Tts:
    def stream(self, **kwargs):  # noqa: ANN003
        if False:
            yield b""


def test_classifier_model_accepts_iterable_response():
    matcher = QaAudioMatcher(store=_Store(), ragflow_service=_Ragflow(), tts_service=_Tts())
    raw = matcher._ask_classifier_model(prompt="x", classifier_chat_name="qa_cls")
    parsed = matcher._parse_classification(raw)
    assert parsed["match"] is True
    assert parsed["candidate_id"] == 1
    assert parsed["confidence"] == 0.9


def test_classifier_model_accepts_dict_content_response():
    matcher = QaAudioMatcher(store=_Store(), ragflow_service=_RagflowDict(), tts_service=_Tts())
    raw = matcher._ask_classifier_model(prompt="x", classifier_chat_name="qa_cls")
    parsed = matcher._parse_classification(raw)
    assert parsed["match"] is True
    assert parsed["candidate_id"] == 2
    assert parsed["confidence"] == 0.88


def test_classifier_model_handles_cumulative_chunks_with_think_tags():
    matcher = QaAudioMatcher(store=_Store(), ragflow_service=_RagflowCumulative(), tts_service=_Tts())
    raw = matcher._ask_classifier_model(prompt="x", classifier_chat_name="qa_cls")
    parsed = matcher._parse_classification(raw)
    assert parsed["match"] is True
    assert parsed["candidate_id"] == 11
    assert parsed["confidence"] == 0.99


def test_parse_classification_picks_last_valid_json_object():
    matcher = QaAudioMatcher(store=_Store(), ragflow_service=_Ragflow(), tts_service=_Tts())
    raw = (
        '{"match": false, "candidate_id": null, "confidence": 0.2, "reason": "not_sure"}\n'
        "noise-between\n"
        '{"match": true, "candidate_id": 8, "confidence": 0.999, "reason": "same_question"}'
    )
    parsed = matcher._parse_classification(raw)
    assert parsed["match"] is True
    assert parsed["candidate_id"] == 8
    assert parsed["confidence"] == 0.999


def test_parse_classification_raises_on_invalid_json_contract():
    matcher = QaAudioMatcher(store=_Store(), ragflow_service=_Ragflow(), tts_service=_Tts())

    with pytest.raises(ValueError, match="invalid_classifier_json"):
        matcher._parse_classification("classifier says probably yes without json")


def test_low_confidence_classifier_match_can_pass_with_soft_accept():
    matcher = QaAudioMatcher(store=_StoreLowRecall(), ragflow_service=_RagflowLowConfidence(), tts_service=_Tts())
    hit = matcher.find_match(
        question="9*0=几?",
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=20,
        threshold=0.85,
        classifier_chat_name="问题比对",
        base_url="http://127.0.0.1:5000",
    )
    assert hit is not None, matcher.get_last_debug()
    assert int(hit["pair_id"]) == 11
    assert str(hit.get("reason") or "") == "classifier_match_soft_accept"


def test_low_confidence_miss_still_exposes_candidate_and_confidence_in_debug():
    matcher = QaAudioMatcher(store=_StoreLowRecall(), ragflow_service=_RagflowVeryLowConfidence(), tts_service=_Tts())
    hit = matcher.find_match(
        question="9*0=几?",
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=20,
        threshold=0.85,
        classifier_chat_name="问题比对",
        base_url="http://127.0.0.1:5000",
    )
    assert hit is None
    dbg = matcher.get_last_debug()
    assert int(dbg.get("candidate_id") or 0) == 11
    assert abs(float(dbg.get("classifier_confidence") or 0.0) - 0.12) < 1e-6


def test_entity_mismatch_forces_reject_even_with_high_classifier_confidence():
    matcher = QaAudioMatcher(store=_StoreEntityMismatch(), ragflow_service=_RagflowHighMismatch(), tts_service=_Tts())
    hit = matcher.find_match(
        question="\u6307\u5f15\u5bfc\u4e1d\u6709\u4ec0\u4e48\u4f5c\u7528",
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=20,
        threshold=0.85,
        classifier_chat_name="\u95ee\u9898\u6bd4\u5bf9",
        base_url="http://127.0.0.1:5000",
    )
    assert hit is None
    dbg = matcher.get_last_debug()
    assert str(dbg.get("reason") or "") == "classifier_entity_mismatch_guard"
    assert float(dbg.get("classifier_confidence") or 1.0) <= 0.2
    assert "\u5bfc\u4e1d" in set(dbg.get("entity_query_terms") or [])
    assert "\u5bfc\u7ba1" in set(dbg.get("entity_candidate_terms") or [])


def test_classifier_model_dependency_error_is_not_silenced():
    matcher = QaAudioMatcher(store=_Store(), ragflow_service=_RagflowBroken(), tts_service=_Tts())

    with pytest.raises(RuntimeError, match="ragflow unavailable"):
        matcher._ask_classifier_model(prompt="x", classifier_chat_name="qa_cls")


def test_classifier_missing_session_is_not_treated_as_empty_no_match():
    matcher = QaAudioMatcher(store=_StoreLowRecall(), ragflow_service=_RagflowMissingSession(), tts_service=_Tts())

    with pytest.raises(RuntimeError, match="qa_audio_classifier_session_missing"):
        matcher.find_match(
            question="9*0=閸?",
            tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
            top_k=20,
            threshold=0.85,
            classifier_chat_name="missing_qa_cls",
            base_url="http://127.0.0.1:5000",
        )


def test_find_match_raises_when_classifier_returns_invalid_json():
    matcher = QaAudioMatcher(store=_StoreLowRecall(), ragflow_service=_RagflowInvalidJson(), tts_service=_Tts())

    with pytest.raises(ValueError, match="invalid_classifier_json"):
        matcher.find_match(
            question="9*0=鍑?",
            tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
            top_k=20,
            threshold=0.85,
            classifier_chat_name="闂姣斿",
            base_url="http://127.0.0.1:5000",
        )
