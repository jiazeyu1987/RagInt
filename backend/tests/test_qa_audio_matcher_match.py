from __future__ import annotations

from backend.services.audio_utils import wrap_pcm16le_as_wav
from backend.services.qa_audio_cache_store import QaAudioCacheStore
from backend.services.qa_audio_matcher import QaAudioMatcher, TtsProfile


class _NoClassifierRagflow:
    def get_session(self, _name):  # noqa: ANN001
        return None


class _NoopTts:
    def stream(self, **_kwargs):  # noqa: ANN003
        if False:
            yield b""


class _CountedClassifierSession:
    def __init__(self, stats: dict[str, int]):
        self._stats = stats

    def ask(self, _prompt: str, stream: bool = False):  # noqa: ARG002
        self._stats["ask"] = int(self._stats.get("ask") or 0) + 1
        return '{"match": false, "candidate_id": null, "confidence": 0.0, "reason": "forced_no_match"}'


class _CountedClassifierRagflow:
    def __init__(self):
        self.stats = {"get_session": 0, "ask": 0}

    def get_session(self, _name):  # noqa: ANN001
        self.stats["get_session"] = int(self.stats.get("get_session") or 0) + 1
        return _CountedClassifierSession(self.stats)


def test_find_match_hits_exact_question_without_classifier(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    matcher = QaAudioMatcher(
        store=store,
        ragflow_service=_NoClassifierRagflow(),
        tts_service=_NoopTts(),
    )

    pcm = b"\x00\x00" * 8000
    wav = wrap_pcm16le_as_wav(pcm, sample_rate=16000, channels=1, bits_per_sample=16)
    pair_id = store.upsert_pair_with_audio(
        question_text="这个展区讲什么？",
        answer_text="这里主要展示心脏介入产品。",
        audio_bytes=wav,
        tts_provider="flash",
        tts_voice="",
        tts_speed=1.0,
        source_request_id="ask_x",
        embedding=matcher._embed_question("这个展区讲什么？"),
    )
    assert pair_id is not None

    hit = matcher.find_match(
        question="这个展区讲什么？",
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=10,
        threshold=0.99,
        classifier_chat_name="__missing__",
        base_url="",
    )

    assert hit is not None
    assert int(hit["pair_id"]) == int(pair_id)
    assert float(hit["confidence"]) == 1.0
    assert str(hit.get("reason") or "") == "exact_normalized_question"
    dbg = matcher.get_last_debug()
    assert bool(dbg.get("classifier_called")) is False


def test_find_match_hits_similar_question_with_heuristic_when_classifier_missing(tmp_path):
    root_dir = tmp_path / "qa_audio_root2"
    db_path = tmp_path / "qa_audio2.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    matcher = QaAudioMatcher(
        store=store,
        ragflow_service=_NoClassifierRagflow(),
        tts_service=_NoopTts(),
    )

    pcm = b"\x00\x00" * 8000
    wav = wrap_pcm16le_as_wav(pcm, sample_rate=16000, channels=1, bits_per_sample=16)
    pair_id = store.upsert_pair_with_audio(
        question_text="company introduction",
        answer_text="we focus on medical devices.",
        audio_bytes=wav,
        tts_provider="flash",
        tts_voice="",
        tts_speed=1.0,
        source_request_id="ask_y",
        embedding=matcher._embed_question("company introduction"),
    )
    assert pair_id is not None

    hit = matcher.find_match(
        question="introduce your company",
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=10,
        threshold=0.95,
        classifier_chat_name="__missing__",
        base_url="",
    )

    assert hit is not None
    assert int(hit["pair_id"]) == int(pair_id)
    assert "similarity" in str(hit.get("reason") or "")
    dbg = matcher.get_last_debug()
    assert bool(dbg.get("classifier_called")) is False


def test_find_match_records_debug_reason_on_miss(tmp_path):
    root_dir = tmp_path / "qa_audio_root3"
    db_path = tmp_path / "qa_audio3.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)
    matcher = QaAudioMatcher(store=store, ragflow_service=_NoClassifierRagflow(), tts_service=_NoopTts())

    hit = matcher.find_match(
        question="unknown question",
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=10,
        threshold=0.9,
        classifier_chat_name="__missing__",
        base_url="",
    )
    dbg = matcher.get_last_debug()
    assert hit is None
    assert str(dbg.get("reason") or "").startswith("classifier_no_match")
    assert bool(dbg.get("no_candidates_in_any_bucket")) is True
    assert str(dbg.get("candidate_source") or "") == "no_candidates_any_bucket"


def test_entity_conflict_blocks_near_match_without_classifier(tmp_path):
    root_dir = tmp_path / "qa_audio_root4"
    db_path = tmp_path / "qa_audio4.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)
    matcher = QaAudioMatcher(store=store, ragflow_service=_NoClassifierRagflow(), tts_service=_NoopTts())

    pcm = b"\x00\x00" * 8000
    wav = wrap_pcm16le_as_wav(pcm, sample_rate=16000, channels=1, bits_per_sample=16)
    q_cached = "\u6307\u5f15\u5bfc\u7ba1\u6709\u4ec0\u4e48\u4f5c\u7528"
    q_input = "\u6307\u5f15\u5bfc\u4e1d\u6709\u4ec0\u4e48\u4f5c\u7528"
    pid = store.upsert_pair_with_audio(
        question_text=q_cached,
        answer_text="\u7528\u4e8e\u5efa\u7acb\u901a\u9053",
        audio_bytes=wav,
        tts_provider="flash",
        tts_voice="",
        tts_speed=1.0,
        source_request_id="ask_z",
        embedding=matcher._embed_question(q_cached),
    )
    assert pid is not None

    hit = matcher.find_match(
        question=q_input,
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=10,
        threshold=0.9,
        classifier_chat_name="__missing__",
        base_url="",
    )
    dbg = matcher.get_last_debug()
    assert hit is None
    assert bool(dbg.get("entity_conflict")) is True
    q_terms = set(dbg.get("entity_query_terms") or [])
    c_terms = set(dbg.get("entity_candidate_terms") or [])
    assert "\u5bfc\u4e1d" in q_terms
    assert "\u5bfc\u7ba1" in c_terms


def test_find_match_falls_back_to_all_buckets_and_runs_classifier(tmp_path):
    root_dir = tmp_path / "qa_audio_root5"
    db_path = tmp_path / "qa_audio5.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)
    ragflow = _CountedClassifierRagflow()
    matcher = QaAudioMatcher(store=store, ragflow_service=ragflow, tts_service=_NoopTts())

    pcm = b"\x00\x00" * 8000
    wav = wrap_pcm16le_as_wav(pcm, sample_rate=16000, channels=1, bits_per_sample=16)
    pair_id = store.upsert_pair_with_audio(
        question_text="alpha feature details",
        answer_text="cached answer",
        audio_bytes=wav,
        tts_provider="flash",
        tts_voice="",
        tts_speed=1.25,
        source_request_id="ask_fallback",
        embedding=matcher._embed_question("alpha feature details"),
    )
    assert pair_id is not None

    hit = matcher.find_match(
        question="where is the parking lot",
        tts_profile=TtsProfile(provider="flash", voice="", speed=1.0),
        top_k=10,
        threshold=0.85,
        classifier_chat_name="问题比对",
        base_url="",
    )

    dbg = matcher.get_last_debug()
    assert hit is None
    assert ragflow.stats.get("get_session") == 1
    assert ragflow.stats.get("ask") == 1
    assert str(dbg.get("candidate_source") or "") == "all_tts_buckets_fallback"
    assert bool(dbg.get("candidate_fallback_used")) is True
    assert int(dbg.get("candidate_count_in_tts_bucket") or 0) == 0
    assert int(dbg.get("candidate_count_any_bucket") or 0) >= 1
    assert bool(dbg.get("classifier_called")) is True
    assert str(dbg.get("reason") or "").startswith("classifier_no_match")
