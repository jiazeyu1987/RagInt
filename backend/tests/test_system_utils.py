from __future__ import annotations

from types import SimpleNamespace

from backend.api.system_utils import derive_status_metrics, find_ask_context, parse_event_query, redact_secrets


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
