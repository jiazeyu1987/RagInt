from __future__ import annotations

from pathlib import Path

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
