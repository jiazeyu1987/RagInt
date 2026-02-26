from __future__ import annotations

import sqlite3

import numpy as np

from backend.services.qa_audio_cache_store import QaAudioCacheStore


def _vec(*vals: float):
    return np.asarray(vals, dtype=np.float32)


def test_qa_audio_store_upsert_search_and_delete(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pair_id = store.upsert_pair_with_audio(
        question_text="心脏介入展厅在哪里？",
        answer_text="心脏介入展厅在二楼东侧。",
        audio_bytes=b"RIFF_FAKE_WAV_1",
        tts_provider="edge",
        tts_voice="zh-CN-XiaoxiaoNeural",
        tts_speed=1.0,
        source_request_id="ask_1",
        embedding=_vec(1.0, 0.0, 0.0, 0.0),
    )

    assert isinstance(pair_id, int) and pair_id > 0

    pair = store.get_pair(pair_id=pair_id)
    assert pair is not None
    assert pair.question_text == "心脏介入展厅在哪里？"
    assert pair.tts_provider == "edge"
    assert pair.tts_voice == "zh-CN-XiaoxiaoNeural"

    audio_path = store.get_audio_file_path(pair_id=pair_id)
    assert audio_path is not None
    assert audio_path.exists()

    cands = store.search_candidates(
        query_embedding=_vec(1.0, 0.0, 0.0, 0.0),
        tts_provider="edge",
        tts_voice="zh-CN-XiaoxiaoNeural",
        tts_speed=1.0,
        top_k=5,
    )
    assert len(cands) == 1
    assert cands[0].pair_id == pair_id

    cands_mismatch = store.search_candidates(
        query_embedding=_vec(1.0, 0.0, 0.0, 0.0),
        tts_provider="edge",
        tts_voice="zh-CN-XiaoxiaoNeural",
        tts_speed=1.25,
        top_k=5,
    )
    assert cands_mismatch == []

    listed = store.list_pairs(limit=10, offset=0)
    assert any(int(x.get("id") or 0) == pair_id for x in listed)

    assert store.delete_pair_hard(pair_id=pair_id) is True
    assert store.get_pair(pair_id=pair_id) is None
    assert not audio_path.exists()


def test_qa_audio_store_upsert_same_question_updates_same_pair(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pid1 = store.upsert_pair_with_audio(
        question_text="这个产品的卖点是什么",
        answer_text="卖点是一体化设计。",
        audio_bytes=b"RIFF_FAKE_WAV_A",
        tts_provider="modelscope",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_a",
        embedding=_vec(0.0, 1.0, 0.0, 0.0),
    )
    pid2 = store.upsert_pair_with_audio(
        question_text="这个产品的卖点是什么",
        answer_text="卖点是稳定性和精度。",
        audio_bytes=b"RIFF_FAKE_WAV_B",
        tts_provider="modelscope",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_b",
        embedding=_vec(0.0, 1.0, 0.0, 0.0),
    )

    assert pid1 is not None
    assert pid2 == pid1

    pair = store.get_pair(pair_id=int(pid1))
    assert pair is not None
    assert pair.answer_text == "卖点是稳定性和精度。"

    all_pairs = store.list_pairs(limit=20, offset=0)
    assert len(all_pairs) == 1


def test_find_exact_pair_legacy_normalized_fallback(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pid = store.upsert_pair_with_audio(
        question_text="9*0=?",
        answer_text="ans",
        audio_bytes=b"RIFF_FAKE_WAV_Q",
        tts_provider="flash",
        tts_voice="",
        tts_speed=1.0,
        source_request_id="ask_q",
        embedding=_vec(1.0, 0.0, 0.0, 0.0),
    )
    assert pid is not None

    # Simulate an old row that stored a legacy normalized_question key.
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("UPDATE qa_audio_pairs SET normalized_question = ? WHERE id = ?", ("9*0\u7b49\u4e8e\u591a\u5c11", int(pid)))
        conn.commit()
    finally:
        conn.close()

    pair = store.find_exact_pair(
        question_text="9*0\u7b49\u4e8e\u591a\u5c11",
        tts_provider="flash",
        tts_voice="",
        tts_speed=1.0,
    )
    assert pair is not None
    assert int(pair.id) == int(pid)
