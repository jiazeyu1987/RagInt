from __future__ import annotations

import numpy as np

from backend.services.audio_utils import wrap_pcm16le_as_wav
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
