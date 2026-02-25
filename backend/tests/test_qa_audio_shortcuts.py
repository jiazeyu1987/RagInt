from __future__ import annotations

from backend.orchestrators.ask_shortcuts import _maybe_stream_audio_cache_hit
from backend.services.safety_filter import SensitiveWordsFilter


class _Matcher:
    def __init__(self, payload=None):
        self.payload = payload or {}
        self.calls = []

    def find_match(self, **kwargs):  # noqa: ANN003
        self.calls.append(dict(kwargs))
        return dict(self.payload)


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
            "answer_text": "这是缓存答案。",
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
            question="这个展区讲什么？",
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
    assert outcome.answer == "这是缓存答案。"
    assert len(matcher.calls) == 1


def test_audio_cache_shortcut_skips_when_provider_missing():
    matcher = _Matcher(payload={
        "pair_id": 1,
        "answer_text": "x",
        "audio_url": "/api/qa_audio_cache/audio/1",
    })
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

    assert payloads == []
    assert outcome is None
    assert matcher.calls == []
