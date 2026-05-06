from __future__ import annotations

import numpy as np
import pytest

from backend.services.audio_utils import wrap_pcm16le_as_wav
from backend.services import qa_audio_matcher as qa_audio_matcher_module
from backend.services.qa_audio_matcher import QaAudioMatcher, TtsProfile


class _FakeStore:
    def __init__(self):
        self.last_upsert = None

    def upsert_pair_with_audio(self, **kwargs):  # noqa: ANN003
        self.last_upsert = kwargs
        return 1


class _FakeRagflowService:
    def get_session(self, _name):  # noqa: ANN001
        return None


class _FakeTtsService:
    def __init__(self, chunks):
        self._chunks = list(chunks)

    def stream(self, **_kwargs):  # noqa: ANN003
        for c in self._chunks:
            yield c


class _FailingStore:
    def upsert_pair_with_audio(self, **kwargs):  # noqa: ANN003
        raise RuntimeError("store write failed")


class _NoneStore:
    def upsert_pair_with_audio(self, **kwargs):  # noqa: ANN003
        return None


def test_qa_audio_matcher_fixes_wav_header_before_store():
    pcm = (b"\x00\x00" * 32000)
    wav = wrap_pcm16le_as_wav(pcm, sample_rate=16000, channels=1, bits_per_sample=16)
    bad = bytearray(wav)
    bad[4:8] = (0x7FFFFFFF).to_bytes(4, byteorder="little", signed=False)
    bad[40:44] = (0x7FFFFFFF).to_bytes(4, byteorder="little", signed=False)

    store = _FakeStore()
    matcher = QaAudioMatcher(
        store=store,
        ragflow_service=_FakeRagflowService(),
        tts_service=_FakeTtsService([bytes(bad)]),
    )

    matcher._upsert_from_answer_sync(
        question="心脏介入展厅在哪里",
        answer="在二楼东侧。",
        request_id="req_1",
        tts_profile=TtsProfile(provider="edge", voice="zh-CN-XiaoxiaoNeural", speed=1.0),
        app_config={"tts": {"provider": "edge"}},
    )

    assert store.last_upsert is not None
    saved = bytes(store.last_upsert["audio_bytes"])
    assert saved[:4] == b"RIFF"
    assert saved[8:12] == b"WAVE"
    assert int.from_bytes(saved[4:8], byteorder="little", signed=False) == len(saved) - 8
    assert int.from_bytes(saved[40:44], byteorder="little", signed=False) == len(saved) - 44
    assert isinstance(store.last_upsert["embedding"], np.ndarray)


def test_qa_audio_matcher_accepts_mp3_container_for_cache():
    store = _FakeStore()
    matcher = QaAudioMatcher(
        store=store,
        ragflow_service=_FakeRagflowService(),
        tts_service=_FakeTtsService([b"ID3\x04\x00\x00\x00\x00\x00\x10"]),
    )

    matcher._upsert_from_answer_sync(
        question="q",
        answer="a",
        request_id="req_2",
        tts_profile=TtsProfile(provider="edge", voice="zh-CN-XiaoxiaoNeural", speed=1.0),
        app_config={"tts": {"provider": "edge"}},
    )

    assert store.last_upsert is not None
    assert bytes(store.last_upsert["audio_bytes"]).startswith(b"ID3")
    assert str(store.last_upsert.get("audio_ext") or "").lower() == ".mp3"


def test_upsert_from_answer_raises_when_tts_returns_no_audio():
    matcher = QaAudioMatcher(
        store=_FakeStore(),
        ragflow_service=_FakeRagflowService(),
        tts_service=_FakeTtsService([]),
    )

    with pytest.raises(ValueError, match="qa_audio_tts_no_audio"):
        matcher._upsert_from_answer_sync(
            question="q",
            answer="a",
            request_id="req_no_audio",
            tts_profile=TtsProfile(provider="edge", voice="zh-CN-XiaoxiaoNeural", speed=1.0),
            app_config={"tts": {"provider": "edge"}},
        )


def test_upsert_from_answer_raises_when_tts_audio_is_unsupported():
    matcher = QaAudioMatcher(
        store=_FakeStore(),
        ragflow_service=_FakeRagflowService(),
        tts_service=_FakeTtsService([b""]),
    )

    with pytest.raises(ValueError, match="qa_audio_tts_no_audio"):
        matcher._upsert_from_answer_sync(
            question="q",
            answer="a",
            request_id="req_empty_chunk",
            tts_profile=TtsProfile(provider="edge", voice="zh-CN-XiaoxiaoNeural", speed=1.0),
            app_config={"tts": {"provider": "edge"}},
        )


def test_upsert_from_answer_raises_when_store_returns_no_pair_id():
    matcher = QaAudioMatcher(
        store=_NoneStore(),
        ragflow_service=_FakeRagflowService(),
        tts_service=_FakeTtsService([b"pcm_bytes"]),
    )

    with pytest.raises(RuntimeError, match="qa_audio_store_upsert_failed"):
        matcher._upsert_from_answer_sync(
            question="q",
            answer="a",
            request_id="req_no_pair_id",
            tts_profile=TtsProfile(provider="edge", voice="zh-CN-XiaoxiaoNeural", speed=1.0),
            app_config={"tts": {"provider": "edge"}},
        )


def test_upsert_from_answer_raises_on_invalid_sample_rate_config():
    matcher = QaAudioMatcher(
        store=_FakeStore(),
        ragflow_service=_FakeRagflowService(),
        tts_service=_FakeTtsService([b"pcm_bytes"]),
    )

    with pytest.raises(ValueError):
        matcher._upsert_from_answer_sync(
            question="q",
            answer="a",
            request_id="req_bad_sample_rate",
            tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
            app_config={"tts": {"provider": "flash", "bailian": {"sample_rate": "not-a-number"}}},
        )


def test_background_upsert_raises_in_synchronous_thread_runner(monkeypatch):
    matcher = QaAudioMatcher(
        store=_FailingStore(),
        ragflow_service=_FakeRagflowService(),
        tts_service=_FakeTtsService([b"pcm_bytes"]),
    )

    class _ImmediateThread:
        def __init__(self, *, target, name: str, daemon: bool):  # noqa: ANN001
            self._target = target
            self.name = name
            self.daemon = daemon

        def start(self):
            self._target()

    monkeypatch.setattr(qa_audio_matcher_module.threading, "Thread", _ImmediateThread)

    with pytest.raises(RuntimeError, match="store write failed"):
        matcher.schedule_upsert_from_answer(
            question="q",
            answer="a",
            request_id="req_store_failure",
            tts_profile=TtsProfile(provider="edge", voice="zh-CN-XiaoxiaoNeural", speed=1.0),
            app_config={"tts": {"provider": "edge"}},
        )
