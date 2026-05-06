from __future__ import annotations

from pathlib import Path

import pytest

from backend.api.tts_recording import StreamingTtsRecorder


class _Logger:
    def __init__(self):
        self.warns: list[str] = []

    def warning(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.warns.append(str(msg))


class _Store:
    def __init__(self, base: Path):
        self.base = base
        self.calls: list[dict] = []

    def audio_dir(self, recording_id: str):
        p = self.base / recording_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def add_tts_audio(self, **kwargs):
        self.calls.append(dict(kwargs))


class _FailingAudioDirStore(_Store):
    def audio_dir(self, recording_id: str):
        raise OSError("audio_dir_failed")


class _FailingAddStore(_Store):
    def add_tts_audio(self, **kwargs):
        raise OSError("add_tts_audio_failed")


class _WriteFailFile:
    def write(self, chunk: bytes):
        raise OSError("write_failed")

    def close(self):
        return None


def test_streaming_tts_recorder_finalize_writes_and_records(tmp_path):
    store = _Store(tmp_path)
    logger = _Logger()
    rec = StreamingTtsRecorder(
        recording_store=store,
        logger=logger,
        recording_id="r1",
        stop_index=2,
        request_id="req1",
        segment_index=3,
        text="hello",
    )

    rec.open()
    rec.write(b"abc")
    rec.write(b"def")
    rec.finalize()

    output = tmp_path / "r1" / "req1_3.wav"
    assert output.exists()
    assert output.read_bytes() == b"abcdef"
    assert len(store.calls) == 1
    assert store.calls[0]["recording_id"] == "r1"
    assert store.calls[0]["stop_index"] == 2
    assert store.calls[0]["segment_index"] == 3
    assert store.calls[0]["rel_path"] == "req1_3.wav"


def test_streaming_tts_recorder_cleanup_deletes_partial(tmp_path):
    store = _Store(tmp_path)
    logger = _Logger()
    rec = StreamingTtsRecorder(
        recording_store=store,
        logger=logger,
        recording_id="r2",
        stop_index=0,
        request_id="req2",
        segment_index=None,
        text="x",
    )

    rec.open()
    rec.write(b"part")
    parts = list((tmp_path / "r2").glob("req2_x.wav*.part"))
    assert len(parts) == 1
    partial = parts[0]

    rec.cleanup()
    assert not partial.exists()
    assert store.calls == []


def test_streaming_tts_recorder_open_failure_raises_when_recording_required(tmp_path):
    rec = StreamingTtsRecorder(
        recording_store=_FailingAudioDirStore(tmp_path),
        logger=_Logger(),
        recording_id="r3",
        stop_index=0,
        request_id="req3",
        segment_index=0,
        text="x",
    )

    with pytest.raises(RuntimeError, match="tts_recording_open_failed"):
        rec.open()


def test_streaming_tts_recorder_write_failure_raises_when_recording_required(tmp_path):
    rec = StreamingTtsRecorder(
        recording_store=_Store(tmp_path),
        logger=_Logger(),
        recording_id="r4",
        stop_index=0,
        request_id="req4",
        segment_index=0,
        text="x",
    )
    rec._audio_file = _WriteFailFile()

    with pytest.raises(RuntimeError, match="tts_recording_write_failed"):
        rec.write(b"abc")


def test_streaming_tts_recorder_finalize_failure_raises_when_recording_required(tmp_path):
    rec = StreamingTtsRecorder(
        recording_store=_FailingAddStore(tmp_path),
        logger=_Logger(),
        recording_id="r5",
        stop_index=0,
        request_id="req5",
        segment_index=0,
        text="x",
    )

    rec.open()
    rec.write(b"abc")
    with pytest.raises(RuntimeError, match="tts_recording_finalize_failed"):
        rec.finalize()
