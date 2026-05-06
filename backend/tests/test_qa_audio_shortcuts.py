from __future__ import annotations

import pytest

from backend.orchestrators.ask_shortcuts import _maybe_stream_cache_hit
from backend.orchestrators.ask_shortcuts import _maybe_stream_audio_cache_hit
from backend.services.safety_filter import SensitiveWordsFilter


class _Matcher:
    def __init__(self, payload=None):
        self.payload = payload or {}
        self.calls = []

    def find_match(self, **kwargs):  # noqa: ANN003
        self.calls.append(dict(kwargs))
        return dict(self.payload)


class _FailingMatcher:
    def find_match(self, **kwargs):  # noqa: ANN003
        raise RuntimeError("qa matcher unavailable")


class _FailingHistoryStore:
    def cache_get(self, *, question: str, kb_version: str):  # noqa: ARG002
        raise RuntimeError("cache store unavailable")


def _collect(gen):
    payloads = []
    while True:
        try:
            payloads.append(next(gen))
        except StopIteration as e:
            return payloads, e.value


def test_audio_cache_shortcut_emits_audio_hit_payload():
    matcher = _Matcher(
        payload={
            "pair_id": 7,
            "answer_text": "cached answer",
            "audio_url": "/api/qa_audio_cache/audio/7",
            "confidence": 0.92,
            "recall_score": 0.81,
            "reason": "same_intent",
        }
    )
    safety = SensitiveWordsFilter.from_config({})

    payloads, outcome = _collect(
        _maybe_stream_audio_cache_hit(
            request_id="ask_1",
            question="what is this zone about?",
            qa_audio_matcher=matcher,
            qa_audio_cache_enabled=True,
            qa_audio_recall_top_k=10,
            qa_audio_classifier_threshold=0.8,
            qa_audio_classifier_chat_name="qa_cls",
            tts_provider="edge",
            tts_voice="zh-CN-XiaoxiaoNeural",
            tts_speed=1.0,
            safety_filter=safety,
            logger=None,
            base_url="",
        )
    )

    assert len(payloads) == 2
    assert payloads[0].get("audio_hit", {}).get("pair_id") == 7
    assert payloads[0].get("cache", {}).get("type") == "qa_audio"
    assert payloads[1].get("done") is True
    assert outcome is not None
    assert outcome.answer == "cached answer"
    assert len(matcher.calls) == 1


def test_audio_cache_shortcut_records_qa_match_timing_points():
    matcher = _Matcher(
        payload={
            "pair_id": 7,
            "answer_text": "cached answer",
            "audio_url": "/api/qa_audio_cache/audio/7",
        }
    )
    safety = SensitiveWordsFilter.from_config({})
    timing_calls = []

    def timings_set(request_id: str, **kwargs):  # noqa: ANN003
        timing_calls.append((request_id, dict(kwargs)))

    payloads, outcome = _collect(
        _maybe_stream_audio_cache_hit(
            request_id="ask_qa_match_1",
            question="what is this zone about?",
            qa_audio_matcher=matcher,
            qa_audio_cache_enabled=True,
            qa_audio_recall_top_k=10,
            qa_audio_classifier_threshold=0.8,
            qa_audio_classifier_chat_name="qa_cls",
            tts_provider="edge",
            tts_voice="zh-CN-XiaoxiaoNeural",
            tts_speed=1.0,
            safety_filter=safety,
            logger=None,
            timings_set=timings_set,
            base_url="",
        )
    )

    assert len(payloads) == 2
    assert outcome is not None
    merged = {}
    for rid, fields in timing_calls:
        assert rid == "ask_qa_match_1"
        merged.update(fields)
    assert "t_qa_match_start_ms" in merged
    assert "t_qa_match_end_ms" in merged
    assert int(merged["t_qa_match_end_ms"]) >= int(merged["t_qa_match_start_ms"])


def test_audio_cache_shortcut_still_checks_match_when_provider_missing():
    matcher = _Matcher(
        payload={
            "pair_id": 1,
            "answer_text": "x",
            "audio_url": "/api/qa_audio_cache/audio/1",
        }
    )
    safety = SensitiveWordsFilter.from_config({})

    payloads, outcome = _collect(
        _maybe_stream_audio_cache_hit(
            request_id="ask_1",
            question="q",
            qa_audio_matcher=matcher,
            qa_audio_cache_enabled=True,
            qa_audio_recall_top_k=10,
            qa_audio_classifier_threshold=0.8,
            qa_audio_classifier_chat_name="qa_cls",
            tts_provider="",
            tts_voice="",
            tts_speed=1.0,
            safety_filter=safety,
            logger=None,
            base_url="",
        )
    )

    assert len(payloads) == 2
    assert outcome is not None
    assert len(matcher.calls) == 1


def test_audio_cache_shortcut_skips_lookup_when_disabled():
    matcher = _Matcher(
        payload={
            "pair_id": 1,
            "answer_text": "x",
            "audio_url": "/api/qa_audio_cache/audio/1",
        }
    )
    safety = SensitiveWordsFilter.from_config({})

    payloads, outcome = _collect(
        _maybe_stream_audio_cache_hit(
            request_id="ask_1",
            question="q",
            qa_audio_matcher=matcher,
            qa_audio_cache_enabled=False,
            qa_audio_recall_top_k=10,
            qa_audio_classifier_threshold=0.8,
            qa_audio_classifier_chat_name="qa_cls",
            tts_provider="edge",
            tts_voice="zh-CN-XiaoxiaoNeural",
            tts_speed=1.0,
            safety_filter=safety,
            logger=None,
            base_url="",
        )
    )

    assert payloads == []
    assert outcome is None
    assert len(matcher.calls) == 0


def test_regular_cache_lookup_dependency_error_is_not_treated_as_miss():
    safety = SensitiveWordsFilter.from_config({})

    with pytest.raises(RuntimeError, match="cache store unavailable"):
        _collect(
            _maybe_stream_cache_hit(
                request_id="ask_cache_fail",
                question="q",
                kb_version="kb1",
                cache_enabled=True,
                safety_filter=safety,
                history_store=_FailingHistoryStore(),
                logger=None,
            )
        )


def test_audio_cache_lookup_dependency_error_is_not_treated_as_miss():
    safety = SensitiveWordsFilter.from_config({})

    with pytest.raises(RuntimeError, match="qa matcher unavailable"):
        _collect(
            _maybe_stream_audio_cache_hit(
                request_id="ask_audio_fail",
                question="q",
                qa_audio_matcher=_FailingMatcher(),
                qa_audio_cache_enabled=True,
                qa_audio_recall_top_k=10,
                qa_audio_classifier_threshold=0.8,
                qa_audio_classifier_chat_name="qa_cls",
                tts_provider="edge",
                tts_voice="zh-CN-XiaoxiaoNeural",
                tts_speed=1.0,
                safety_filter=safety,
                logger=None,
                base_url="",
            )
        )
