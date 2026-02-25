from __future__ import annotations

from backend.services.qa_audio_cache_store import QaAudioCacheStore


def test_get_audio_file_path_repairs_raw_pcm_to_wav(tmp_path):
    root_dir = tmp_path / "qa_audio_root"
    db_path = tmp_path / "qa_audio.db"
    store = QaAudioCacheStore(root_dir=root_dir, db_path=db_path)

    # Intentionally store raw PCM bytes as historical bad data.
    raw_pcm = (b"\x00\x00\x01\x00\xff\x7f\x00\x80" * 4000)
    pair_id = store.upsert_pair_with_audio(
        question_text="where is hall a",
        answer_text="hall a is on floor 2",
        audio_bytes=raw_pcm,
        tts_provider="modelscope",
        tts_voice="v1",
        tts_speed=1.0,
        source_request_id="ask_bad_pcm",
        embedding=[0.1, 0.2, 0.3],
    )
    assert pair_id is not None

    p = store.get_audio_file_path(pair_id=int(pair_id))
    assert p is not None
    b = p.read_bytes()
    assert b[:4] == b"RIFF"
    assert b[8:12] == b"WAVE"

