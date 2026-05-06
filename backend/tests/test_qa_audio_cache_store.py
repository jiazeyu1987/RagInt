from __future__ import annotations

import io
import sqlite3
import wave
import builtins
from pathlib import Path

import numpy as np
import pytest

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


def test_find_exact_pair_rejects_legacy_normalized_key_without_fallback_scan(tmp_path):
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
        conn.execute("UPDATE qa_audio_pairs SET normalized_question = ? WHERE id = ?", ("legacy-only-key", int(pid)))
        conn.commit()
    finally:
        conn.close()

    pair = store.find_exact_pair(
        question_text="9*0=?",
        tts_provider="flash",
        tts_voice="",
        tts_speed=1.0,
    )
    assert pair is None


def test_cleanup_invalid_audio_pairs_removes_missing_and_zero_duration_wav(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    valid_id = store.upsert_pair_with_audio(
        question_text="valid q",
        answer_text="valid a",
        audio_bytes=b"valid_pcm_bytes_1234",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_valid",
        embedding=_vec(1.0, 0.0, 0.0, 0.0),
    )
    missing_id = store.upsert_pair_with_audio(
        question_text="missing q",
        answer_text="missing a",
        audio_bytes=b"missing_pcm_bytes_5678",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_missing",
        embedding=_vec(1.0, 0.0, 0.0, 0.0),
    )
    zero_id = store.upsert_pair_with_audio(
        question_text="zero q",
        answer_text="zero a",
        audio_bytes=b"zero_pcm_bytes_9012",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_zero",
        embedding=_vec(1.0, 0.0, 0.0, 0.0),
    )
    assert isinstance(valid_id, int)
    assert isinstance(missing_id, int)
    assert isinstance(zero_id, int)

    missing_path = store.get_audio_file_path(pair_id=int(missing_id))
    assert missing_path is not None and missing_path.exists()
    missing_path.unlink(missing_ok=True)

    zero_path = store.get_audio_file_path(pair_id=int(zero_id))
    assert zero_path is not None
    wav_buf = io.BytesIO()
    with wave.open(wav_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"")
    zero_path.write_bytes(wav_buf.getvalue())

    result = store.cleanup_invalid_audio_pairs()
    assert int(result["scanned"]) == 3
    assert int(result["invalid"]) == 2
    assert int(result["deleted"]) == 2
    assert sorted(int(x) for x in result["deleted_ids"]) == sorted([int(missing_id), int(zero_id)])
    assert int(result["reason_counts"].get("audio_file_missing") or 0) == 1
    assert int(result["reason_counts"].get("wav_duration_zero") or 0) == 1

    assert store.get_pair(pair_id=int(valid_id)) is not None
    assert store.get_pair(pair_id=int(missing_id)) is None
    assert store.get_pair(pair_id=int(zero_id)) is None


def test_get_audio_file_path_distinguishes_missing_pair_from_missing_audio_file(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    assert store.get_audio_file_path(pair_id=404) is None

    pair_id = store.upsert_pair_with_audio(
        question_text="missing file q",
        answer_text="missing file a",
        audio_bytes=b"pcm_bytes_for_missing_file",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_missing_file",
        embedding=_vec(1.0, 0.0, 0.0),
    )
    assert isinstance(pair_id, int)
    audio_path = store.get_audio_file_path(pair_id=pair_id)
    assert audio_path is not None
    audio_path.unlink(missing_ok=True)

    with pytest.raises(FileNotFoundError, match="qa_audio_file_missing"):
        store.get_audio_file_path(pair_id=pair_id)


def test_upsert_pair_rejects_invalid_tts_speed_and_audio_extension(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    with pytest.raises(ValueError, match="invalid_tts_speed"):
        store.upsert_pair_with_audio(
            question_text="bad speed q",
            answer_text="bad speed a",
            audio_bytes=b"pcm_bytes_for_bad_speed",
            audio_ext=".wav",
            tts_provider="edge",
            tts_voice="v1",
            tts_speed="fast",
            source_request_id="ask_bad_speed",
            embedding=_vec(1.0, 0.0, 0.0),
        )

    with pytest.raises(ValueError, match="unsupported_audio_ext"):
        store.upsert_pair_with_audio(
            question_text="bad ext q",
            answer_text="bad ext a",
            audio_bytes=b"pcm_bytes_for_bad_ext",
            audio_ext=".aac",
            tts_provider="edge",
            tts_voice="v1",
            tts_speed=1.0,
            source_request_id="ask_bad_ext",
            embedding=_vec(1.0, 0.0, 0.0),
        )


@pytest.mark.parametrize("bad_rel_path", ["../outside.wav", "/audio/outside.wav", "audio\\outside.wav"])
def test_get_audio_file_path_raises_on_invalid_audio_rel_path(tmp_path, bad_rel_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pair_id = store.upsert_pair_with_audio(
        question_text="bad path q",
        answer_text="bad path a",
        audio_bytes=b"pcm_bytes_for_bad_path",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_bad_path",
        embedding=_vec(1.0, 0.0, 0.0),
    )
    assert isinstance(pair_id, int)

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("UPDATE qa_audio_pairs SET audio_rel_path = ? WHERE id = ?", (bad_rel_path, int(pair_id)))
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError, match="bad_rel_path"):
        store.get_audio_file_path(pair_id=pair_id)


def test_search_candidates_raises_on_corrupt_embedding_blob(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pair_id = store.upsert_pair_with_audio(
        question_text="corrupt vector q",
        answer_text="corrupt vector a",
        audio_bytes=b"pcm_bytes_for_corrupt_vector",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_corrupt_vector",
        embedding=_vec(1.0, 0.0, 0.0),
    )
    assert isinstance(pair_id, int)

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("UPDATE qa_audio_embeddings SET embedding_dim = ? WHERE pair_id = ?", (99, int(pair_id)))
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError, match="embedding dim mismatch"):
        store.search_candidates(
            query_embedding=_vec(1.0, 0.0, 0.0),
            tts_provider="edge",
            tts_voice="v1",
            tts_speed=1.0,
            top_k=5,
        )


def test_cleanup_invalid_audio_pairs_raises_when_deleted_audio_file_cannot_be_removed(tmp_path, monkeypatch):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pair_id = store.upsert_pair_with_audio(
        question_text="zero cleanup q",
        answer_text="zero cleanup a",
        audio_bytes=b"pcm_bytes_for_cleanup_failure",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_cleanup_failure",
        embedding=_vec(1.0, 0.0, 0.0),
    )
    assert isinstance(pair_id, int)
    audio_path = store.get_audio_file_path(pair_id=pair_id)
    assert audio_path is not None

    wav_buf = io.BytesIO()
    with wave.open(wav_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"")
    audio_path.write_bytes(wav_buf.getvalue())

    original_unlink = type(audio_path).unlink

    def fail_target_unlink(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        if self == audio_path:
            raise PermissionError("cannot remove stale audio")
        return original_unlink(self, *args, **kwargs)

    monkeypatch.setattr(type(audio_path), "unlink", fail_target_unlink)

    with pytest.raises(PermissionError, match="cannot remove stale audio"):
        store.cleanup_invalid_audio_pairs()

    assert store.get_pair(pair_id=pair_id) is not None


def test_cleanup_invalid_audio_pairs_raises_on_corrupt_wav_duration(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pair_id = store.upsert_pair_with_audio(
        question_text="corrupt wav q",
        answer_text="corrupt wav a",
        audio_bytes=b"pcm_bytes_for_corrupt_wav",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_corrupt_wav",
        embedding=_vec(1.0, 0.0, 0.0),
    )
    assert isinstance(pair_id, int)
    audio_path = store.get_audio_file_path(pair_id=pair_id)
    assert audio_path is not None
    audio_path.write_bytes(b"RIFF\x08\x00\x00\x00WAVEbad!")

    with pytest.raises(ValueError, match="wav_duration_unreadable"):
        store.cleanup_invalid_audio_pairs()

    assert store.get_pair(pair_id=pair_id) is not None


def test_cleanup_invalid_audio_pairs_raises_when_audio_header_cannot_be_read(tmp_path, monkeypatch):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pair_id = store.upsert_pair_with_audio(
        question_text="unreadable header q",
        answer_text="unreadable header a",
        audio_bytes=b"pcm_bytes_for_unreadable_header",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_unreadable_header",
        embedding=_vec(1.0, 0.0, 0.0),
    )
    assert isinstance(pair_id, int)
    audio_path = store.get_audio_file_path(pair_id=pair_id)
    assert audio_path is not None

    original_open = builtins.open

    def fail_target_open(file, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        if Path(file) == audio_path and args and args[0] == "rb":
            raise PermissionError("cannot read audio header")
        return original_open(file, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", fail_target_open)

    with pytest.raises(PermissionError, match="cannot read audio header"):
        store.cleanup_invalid_audio_pairs()


@pytest.mark.parametrize("bad_rel_path", ["/audio/orphan.wav", "audio\\orphan.wav"])
def test_cleanup_invalid_audio_pairs_deletes_rows_with_malformed_audio_paths(tmp_path, bad_rel_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    pair_id = store.upsert_pair_with_audio(
        question_text="bad rel path q",
        answer_text="bad rel path a",
        audio_bytes=b"pcm_bytes_for_bad_path",
        tts_provider="edge",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_bad_path",
        embedding=_vec(1.0, 0.0, 0.0),
    )
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("UPDATE qa_audio_pairs SET audio_rel_path = ? WHERE id = ?", (bad_rel_path, int(pair_id)))
        conn.commit()
    finally:
        conn.close()

    result = store.cleanup_invalid_audio_pairs()

    assert result["deleted"] == 1
    assert result["reason_counts"]["audio_rel_path_invalid"] == 1
    assert store.get_pair(pair_id=pair_id) is None
