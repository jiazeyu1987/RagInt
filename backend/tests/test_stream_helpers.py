from __future__ import annotations

from backend.orchestrators.ragflow_streaming import (
    _apply_qa_max_chars_limit,
    _close_response_safely,
    _update_safety_stream_tail_and_check,
)


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
