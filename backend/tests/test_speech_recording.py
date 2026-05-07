from __future__ import annotations

import pytest

from backend.api.speech_recording import AskRecordingSink
from backend.orchestrators.stream_payloads import make_chunk, make_done, make_segment


class _Store:
    def __init__(self):
        self.events: list[tuple] = []

    def add_ask_event(self, *, recording_id: str, stop_index: int, request_id: str, kind: str, text: str | None):
        self.events.append((recording_id, stop_index, request_id, kind, text))


class _FailingStore:
    def add_ask_event(self, *, recording_id: str, stop_index: int, request_id: str, kind: str, text: str | None):
        raise RuntimeError(f"recording_store_failed:{kind}")


def test_recording_sink_writes_chunk_segment_done():
    store = _Store()
    sink = AskRecordingSink(recording_store=store, recording_id="rec1", stop_index=2, tour_action="go", request_id="r1")

    sink.on_payload(make_chunk("hi", done=False))
    sink.on_payload(make_segment("seg", segment_seq=1, done=False))
    sink.on_payload(make_done())

    assert store.events == [
        ("rec1", 2, "r1", "chunk", "hi"),
        ("rec1", 2, "r1", "segment", "seg"),
        ("rec1", 2, "r1", "done", None),
    ]


def test_recording_sink_disabled_noop():
    store = _Store()
    sink = AskRecordingSink(recording_store=store, recording_id=None, stop_index=2, tour_action="go", request_id="r1")
    sink.on_payload(make_chunk("hi", done=False))
    assert store.events == []


def test_recording_sink_raises_when_store_write_fails():
    sink = AskRecordingSink(
        recording_store=_FailingStore(),
        recording_id="rec1",
        stop_index=2,
        tour_action="go",
        request_id="r1",
    )

    with pytest.raises(RuntimeError, match="recording_store_failed:chunk"):
        sink.on_payload(make_chunk("hi", done=False))
