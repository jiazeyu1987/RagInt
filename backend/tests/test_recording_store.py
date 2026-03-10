from __future__ import annotations

import logging
import shutil
import time
import uuid
from pathlib import Path

import pytest

from backend.services.recording_store import RecordingStore


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"recording_store_test_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _store(work_dir: Path):
    return RecordingStore(work_dir / "recordings", logger=logging.getLogger("test_recording_store"))


def test_create_list_get_finish_delete_roundtrip(work_dir: Path):
    store = _store(work_dir)

    info = store.create(
        recording_id="rec_1",
        stops=["Stop A", "Stop B"],
        metadata={"tts_provider": "edge", "tts_voice": "voice_a"},
    )
    assert info.recording_id == "rec_1"
    assert info.finished_at_ms is None
    assert info.stops == ["Stop A", "Stop B"]
    assert info.metadata["tts_provider"] == "edge"

    rec = store.get("rec_1")
    assert rec is not None
    assert rec["recording_id"] == "rec_1"
    assert rec["stops"] == ["Stop A", "Stop B"]
    assert rec["metadata"]["tts_voice"] == "voice_a"

    listed = store.list(limit=10)
    assert len(listed) == 1
    assert listed[0]["recording_id"] == "rec_1"
    assert listed[0]["stop_count"] == 2
    assert listed[0]["metadata"]["tts_provider"] == "edge"

    store.finish("rec_1")
    rec_after_finish = store.get("rec_1")
    assert rec_after_finish is not None
    assert rec_after_finish["finished_at_ms"] is not None

    audio_dir = store.audio_dir("rec_1")
    audio_file = audio_dir / "s0.wav"
    audio_file.write_bytes(b"wav-bytes")
    store.add_ask_event(recording_id="rec_1", stop_index=0, request_id="ask_1", kind="chunk", text="hello")
    store.add_tts_audio(recording_id="rec_1", stop_index=0, request_id="ask_1", segment_index=0, text="hello", rel_path="s0.wav")

    store.delete("rec_1")
    assert store.get("rec_1") is None
    assert store.list(limit=10) == []
    assert not (work_dir / "recordings" / "rec_1").exists()


def test_ask_and_tts_seq_increment_per_stop(work_dir: Path):
    store = _store(work_dir)
    store.create(recording_id="rec_seq", stops=["A", "B"])

    store.add_ask_event(recording_id="rec_seq", stop_index=0, request_id="ask_1", kind="chunk", text="c0")
    store.add_ask_event(recording_id="rec_seq", stop_index=0, request_id="ask_1", kind="segment", text="s1")
    store.add_ask_event(recording_id="rec_seq", stop_index=0, request_id="ask_1", kind="done", text=None)
    store.add_ask_event(recording_id="rec_seq", stop_index=1, request_id="ask_2", kind="chunk", text="c0")

    store.add_tts_audio(recording_id="rec_seq", stop_index=0, request_id="ask_1", segment_index=0, text="t0", rel_path="a0.wav")
    store.add_tts_audio(recording_id="rec_seq", stop_index=0, request_id="ask_1", segment_index=1, text="t1", rel_path="a1.wav")
    store.add_tts_audio(recording_id="rec_seq", stop_index=1, request_id="ask_2", segment_index=0, text="t0", rel_path="b0.wav")

    conn = store._connect()  # noqa: SLF001 - unit test validates persistence behavior.
    try:
        ask0 = conn.execute(
            "SELECT seq FROM recording_ask_events WHERE recording_id=? AND stop_index=? ORDER BY seq ASC",
            ("rec_seq", 0),
        ).fetchall()
        ask1 = conn.execute(
            "SELECT seq FROM recording_ask_events WHERE recording_id=? AND stop_index=? ORDER BY seq ASC",
            ("rec_seq", 1),
        ).fetchall()
        tts0 = conn.execute(
            "SELECT seq FROM recording_tts_audio WHERE recording_id=? AND stop_index=? ORDER BY seq ASC",
            ("rec_seq", 0),
        ).fetchall()
        tts1 = conn.execute(
            "SELECT seq FROM recording_tts_audio WHERE recording_id=? AND stop_index=? ORDER BY seq ASC",
            ("rec_seq", 1),
        ).fetchall()
    finally:
        conn.close()

    assert [int(r["seq"]) for r in ask0] == [0, 1, 2]
    assert [int(r["seq"]) for r in ask1] == [0]
    assert [int(r["seq"]) for r in tts0] == [0, 1]
    assert [int(r["seq"]) for r in tts1] == [0]


def test_stop_payload_and_segment_update_versioned_url(work_dir: Path):
    store = _store(work_dir)
    store.create(recording_id="rec_payload", stops=["Stop A"])

    store.add_ask_event(recording_id="rec_payload", stop_index=0, request_id="ask_1", kind="chunk", text="chunk_a")
    store.add_ask_event(recording_id="rec_payload", stop_index=0, request_id="ask_1", kind="chunk", text="chunk_b")
    store.add_tts_audio(
        recording_id="rec_payload",
        stop_index=0,
        request_id="ask_1",
        segment_index=0,
        text="segment_v1",
        rel_path="seg_v1.wav",
    )

    payload_v1 = store.get_stop_payload(recording_id="rec_payload", stop_index=0, base_url="http://localhost:8000")
    assert payload_v1 is not None
    assert payload_v1["chunks"] == ["segment_v1"]
    assert payload_v1["answer_text"] == "segment_v1"
    assert len(payload_v1["segments"]) == 1
    seg = payload_v1["segments"][0]
    assert seg["audio_url"].startswith("http://localhost:8000/api/recordings/rec_payload/audio/seg_v1.wav")
    assert "?v=" in seg["audio_url"]

    seg_id = int(seg["segment_id"])
    time.sleep(0.01)
    updated = store.update_tts_segment(
        recording_id="rec_payload",
        segment_id=seg_id,
        text="segment_v2",
        rel_path="seg_v2.wav",
    )
    assert updated is not None
    assert updated["text"] == "segment_v2"
    assert str(updated["rel_path"]) == "seg_v2.wav"

    payload_v2 = store.get_stop_payload(recording_id="rec_payload", stop_index=0, base_url="http://localhost:8000")
    assert payload_v2 is not None
    assert payload_v2["chunks"] == ["segment_v2"]
    assert payload_v2["answer_text"] == "segment_v2"
    assert payload_v2["segments"][0]["audio_url"].startswith("http://localhost:8000/api/recordings/rec_payload/audio/seg_v2.wav")
    assert "?v=" in payload_v2["segments"][0]["audio_url"]

    assert store.count_tts_rel_path_refs(recording_id="rec_payload", rel_path="seg_v2.wav") == 1
    assert store.count_tts_rel_path_refs(recording_id="rec_payload", rel_path="seg_v2.wav", exclude_segment_id=seg_id) == 0


def test_safe_audio_path_guards(work_dir: Path):
    store = _store(work_dir)

    with pytest.raises(ValueError, match="recording_id_empty"):
        store.safe_rel_audio_path("", "a.wav")
    with pytest.raises(ValueError, match="bad_filename"):
        store.safe_rel_audio_path("rec_guard", "../a.wav")

    safe_path = store.safe_rel_audio_path("rec_guard", "nested/a.wav")
    ensured = store.ensure_within_audio_dir("rec_guard", safe_path)
    assert safe_path == ensured

    with pytest.raises(ValueError, match="path_outside_audio_dir"):
        store.ensure_within_audio_dir("rec_guard", work_dir / "outside.wav")
