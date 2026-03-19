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


def test_derive_status_metrics_full_chain_breakdown():
    timing = {
        "t_submit": 1.0,
        "t_ragflow_request_start": 1.07,
        "t_ragflow_first_chunk": 1.1,
        "t_ragflow_first_text": 1.15,
        "t_first_tts_segment": 1.3,
        "t_tts_first_audio": 1.45,
        "t_play_end": 2.0,
        "t_server_receive_wall_ms": 1975,
        "t_request_parse_done_wall_ms": 1978,
        "t_conversation_resolved_wall_ms": 1982,
        "t_orchestrator_ready_wall_ms": 1988,
        "t_qa_match_start_ms": 1990,
        "t_qa_match_end_ms": 1996,
        "t_submit_wall_ms": 2000,
        "t_ask_client_start_ms": 1900,
        "t_ask_client_submit_ms": 1920,
        "t_asr_pending_ms": 1200,
        "t_asr_filter_start_ms": 1300,
        "t_asr_filter_end_ms": 1600,
        "t_asr_accepted_ms": 1750,
        "t_play_end_client_ms": 3200,
    }
    got = derive_status_metrics(timing=timing, now_perf=2.5)
    assert got["rag_first_chunk_to_first_text_ms"] == 50.0
    assert got["rag_first_text_to_first_segment_ms"] == 150.0
    assert got["first_segment_to_tts_first_audio_ms"] == 150.0
    assert got["tts_first_audio_to_play_end_ms"] == 550.0
    assert got["asr_pending_to_filter_start_ms"] == 100.0
    assert got["asr_filter_ms"] == 300.0
    assert got["asr_filter_to_accepted_ms"] == 150.0
    assert got["asr_postprocess_total_ms"] == 550.0
    assert got["asr_accepted_to_ask_client_start_ms"] == 150.0
    assert got["ask_client_start_to_client_submit_ms"] == 20.0
    assert got["client_submit_to_server_receive_ms"] == 55.0
    assert got["ask_client_start_to_server_receive_ms"] == 75.0
    assert got["ask_client_start_to_request_parse_done_ms"] == 78.0
    assert got["ask_client_start_to_conversation_resolved_ms"] == 82.0
    assert got["ask_client_start_to_orchestrator_ready_ms"] == 88.0
    assert got["ask_client_start_to_qa_match_start_ms"] == 90.0
    assert got["ask_client_start_to_qa_match_end_ms"] == 96.0
    assert got["server_receive_to_request_parse_done_ms"] == 3.0
    assert got["server_receive_to_conversation_resolved_ms"] == 7.0
    assert got["server_receive_to_orchestrator_ready_ms"] == 13.0
    assert got["server_receive_to_qa_match_start_ms"] == 15.0
    assert got["server_receive_to_qa_match_end_ms"] == 21.0
    assert got["request_parse_to_conversation_resolved_ms"] == 4.0
    assert got["conversation_resolved_to_orchestrator_ready_ms"] == 6.0
    assert got["orchestrator_ready_to_qa_match_start_ms"] == 2.0
    assert got["qa_match_ms"] == 6.0
    assert got["server_receive_to_server_submit_ms"] == 25.0
    assert got["server_receive_to_rag_request_ms"] == 70.0
    assert got["submit_to_rag_request_ms"] == 70.0
    assert got["server_receive_to_rag_request_total_ms"] == 95.0
    assert got["server_receive_to_rag_first_chunk_ms"] == 125.0
    assert got["server_receive_to_rag_first_text_ms"] == 175.0
    assert got["server_receive_to_first_segment_ms"] == 325.0
    assert got["server_receive_to_tts_first_audio_ms"] == 475.0
    assert got["server_receive_to_play_end_ms"] == 1025.0
    assert got["ask_client_start_to_rag_request_ms"] == 145.0
    assert got["ask_client_start_to_server_submit_ms"] == 100.0
    assert got["rag_request_to_first_chunk_ms"] == 30.0
    assert got["ask_client_start_to_play_end_client_ms"] == 1300.0


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
