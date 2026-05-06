from __future__ import annotations

import pytest

from backend.orchestrators.ragflow_streaming import (
    _apply_qa_max_chars_limit,
    _close_response_safely,
    _extract_ragflow_chunk_content,
    _update_safety_stream_tail_and_check,
)
from backend.orchestrators.ragflow_streaming_helpers import _ThinkTagStreamSanitizer
from backend.orchestrators.stream_payloads import classify_text_event, get_chunk, get_segment


class _Resp:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class _Safety:
    def __init__(self, *, enabled: bool = True, blocked_term: str = "bad"):
        self.enabled = bool(enabled)
        self._blocked = str(blocked_term)

    def update_stream_tail_and_match(self, *, tail_norm: str, new_text: str):
        tail_norm = (tail_norm or "") + (new_text or "")
        if self._blocked and self._blocked in tail_norm:
            return self._blocked, tail_norm
        return None, tail_norm


class _Logger:
    def warning(self, _msg: str) -> None:
        return None


class _Chunk:
    def __init__(self, content):
        self.content = content


def test_apply_qa_max_chars_limit_stop_before_emit_when_no_remaining():
    new_part, stop_before, stop_after = _apply_qa_max_chars_limit(new_part="x", current_answer_len=10, qa_max_answer_chars=10)
    assert new_part == ""
    assert stop_before is True
    assert stop_after is False


def test_apply_qa_max_chars_limit_trims_and_stop_after_emit():
    new_part, stop_before, stop_after = _apply_qa_max_chars_limit(new_part="abcdef", current_answer_len=8, qa_max_answer_chars=10)
    assert new_part == "ab"
    assert stop_before is False
    assert stop_after is True


def test_apply_qa_max_chars_limit_no_limit_when_max_zero():
    new_part, stop_before, stop_after = _apply_qa_max_chars_limit(new_part="abcdef", current_answer_len=1, qa_max_answer_chars=0)
    assert new_part == "abcdef"
    assert stop_before is False
    assert stop_after is False


def test_close_response_safely_calls_close_if_present():
    r = _Resp()
    _close_response_safely(r)
    assert r.closed is True


def test_update_safety_stream_tail_and_check_disabled_noop():
    s = _Safety(enabled=False, blocked_term="bad")
    matched, tail = _update_safety_stream_tail_and_check(safety_filter=s, tail_norm="a", new_text="bad")
    assert matched is None
    assert tail == "a"


def test_update_safety_stream_tail_and_check_updates_tail_and_matches():
    s = _Safety(enabled=True, blocked_term="bad")
    matched, tail = _update_safety_stream_tail_and_check(safety_filter=s, tail_norm="", new_text="xxbadyy")
    assert matched == "bad"
    assert "bad" in tail


def test_extract_ragflow_chunk_content_keeps_empty_content_as_real_no_text():
    assert _extract_ragflow_chunk_content(_Chunk(""), agent_id="", last_ragflow_content="", logger=_Logger()) == ""


def test_extract_ragflow_chunk_content_rejects_missing_content_schema():
    with pytest.raises(ValueError, match="missing content"):
        _extract_ragflow_chunk_content(object(), agent_id="", last_ragflow_content="", logger=_Logger())


def test_extract_ragflow_chunk_content_rejects_none_content_value():
    with pytest.raises(ValueError, match="content is None"):
        _extract_ragflow_chunk_content(_Chunk(None), agent_id="", last_ragflow_content="", logger=_Logger())


def test_stream_payload_accessors_keep_empty_text_but_reject_schema_errors():
    assert get_chunk({"chunk": ""}) == ""
    assert get_segment({"segment": ""}) == ""

    with pytest.raises(ValueError, match="missing chunk"):
        get_chunk({"segment": "tts"})
    with pytest.raises(ValueError, match="chunk is None"):
        get_chunk({"chunk": None})
    with pytest.raises(ValueError, match="segment is None"):
        get_segment({"segment": None})


def test_classify_text_event_distinguishes_empty_text_from_invalid_schema():
    assert classify_text_event({"chunk": "", "done": False}) == (None, None)
    assert classify_text_event({"segment": "   ", "done": False}) == (None, None)
    assert classify_text_event({"meta": {"request_id": "r1"}, "done": False}) == (None, None)

    with pytest.raises(ValueError, match="unknown stream payload schema"):
        classify_text_event({"unexpected": "value", "done": False})


def test_think_tag_stream_sanitizer_removes_single_chunk_block():
    sanitizer = _ThinkTagStreamSanitizer()
    out = sanitizer.feed("回答:<think>内部推理</think>你好")
    assert out == "回答:你好"


def test_think_tag_stream_sanitizer_handles_cross_chunk_tags():
    sanitizer = _ThinkTagStreamSanitizer()
    out1 = sanitizer.feed("回答:<thi")
    out2 = sanitizer.feed("nk>内部推理</th")
    out3 = sanitizer.feed("ink>你好")
    assert out1 == "回答:"
    assert out2 == ""
    assert out3 == "你好"


def test_think_tag_stream_sanitizer_removes_orphan_close_tag():
    sanitizer = _ThinkTagStreamSanitizer()
    out = sanitizer.feed("a</think>b")
    assert out == "ab"
