from __future__ import annotations

from backend.api.speech_telemetry import AskStreamTelemetry
from backend.orchestrators.stream_payloads import make_chunk, make_segment


class _Events:
    def __init__(self):
        self.events: list[dict] = []

    def emit(self, **kw):
        self.events.append(dict(kw))


class _Timings:
    def __init__(self):
        self.calls: list[tuple] = []

    def set(self, request_id: str, **kw):
        self.calls.append((request_id, dict(kw)))


def test_telemetry_emits_first_text_and_segment_once():
    events = _Events()
    timings = _Timings()
    t = AskStreamTelemetry(event_store=events, ask_timings=timings, request_id="r1", client_id="c1")

    t.on_payload(make_chunk("a", done=False))
    t.on_payload(make_chunk("b", done=False))
    t.on_payload(make_segment("seg", segment_seq=7, done=False))
    t.on_payload(make_segment("seg2", segment_seq=8, done=False))

    names = [e["name"] for e in events.events]
    assert names.count("rag_first_text") == 1
    assert names.count("first_tts_segment") == 1
    assert events.events[-1]["segment_seq"] == 7

