from __future__ import annotations

from types import SimpleNamespace

from backend.api.system_utils import (
    build_recent_asr_timeline_report,
    derive_status_metrics,
    find_ask_context,
    parse_event_query,
    redact_secrets,
)


def test_redact_secrets_nested_fields():
    src = {"api_key": "k1", "a": {"token": "t1", "ok": 1}, "list": [{"password": "p"}, {"x": 2}]}
    got = redact_secrets(src)
    assert got["api_key"] == "***REDACTED***"
    assert got["a"]["token"] == "***REDACTED***"
    assert got["a"]["ok"] == 1
    assert got["list"][0]["password"] == "***REDACTED***"


def test_parse_event_query_defaults_and_invalid_values():
    req = SimpleNamespace(args={"limit": "x", "since_ms": "bad"}, headers={})
    q = parse_event_query(req)
    assert q.request_id == ""
    assert q.limit == 200
    assert q.since_ms is None
    assert q.fmt == "json"


def test_derive_status_metrics_filters_none_and_computes_ms():
    timing = {"t_submit": 1.0, "t_ragflow_first_chunk": 1.2, "t_play_end": 2.0}
    got = derive_status_metrics(timing=timing, now_perf=2.5)
    assert got["submit_to_rag_first_chunk_ms"] == 200.0
    assert got["submit_to_play_end_ms"] == 1000.0
    assert got["now_since_submit_ms"] == 1500.0
    assert "submit_to_first_segment_ms" not in got


class _Events:
    def list_events(self, *, request_id: str, limit: int):  # noqa: ARG002
        return [
            {"name": "x"},
            {"name": "ask_received", "fields": {"stop_name": "A", "stop_id": "stop_1", "action_type": "continue"}},
        ]


def test_find_ask_context_from_recent_events():
    got = find_ask_context(event_store=_Events(), request_id="r1")
    assert got["stop_name"] == "A"
    assert got["stop_id"] == "stop_1"
    assert got["action_type"] == "continue"


def test_build_recent_asr_timeline_report_groups_and_durations():
    got = build_recent_asr_timeline_report(
        [
            {"request_id": "r1", "name": "asr_pending_asr_matched", "ts_ms": 1000, "fields": {"rawText": "原始文本"}},
            {"request_id": "r1", "name": "asr_filtering_finished", "ts_ms": 1250, "fields": {"correctedText": "纠错文本"}},
            {"request_id": "r1", "name": "asr_accepted", "ts_ms": 1600, "fields": {"finalText": "最终文本"}},
            {"request_id": "r2", "name": "asr_wake_word_missing", "ts_ms": 2000, "fields": {"rawText": "你好"}},
            {"request_id": "r2", "name": "other_event", "ts_ms": 2100},
        ]
    )

    assert got["count"] == 2
    r1 = next(item for item in got["items"] if item["request_id"] == "r1")
    assert r1["stage_count"] == 3
    assert r1["total_ms"] == 600
    assert r1["stages"][0]["category"] == "filter"
    assert r1["stages"][0]["duration_ms"] == 250
    assert r1["stages"][1]["corrected_text"] == "纠错文本"
    assert r1["stages"][2]["category"] == "accepted"
    assert r1["stages"][2]["final_text"] == "最终文本"

    r2 = next(item for item in got["items"] if item["request_id"] == "r2")
    assert r2["stages"][0]["category"] == "wake_word"
    assert r2["stages"][0]["tone"] == "warn"
