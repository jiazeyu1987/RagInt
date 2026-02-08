from __future__ import annotations

from backend.orchestrators.ragflow_streaming import (
    _apply_no_self_intro_prefix,
    _emit_tts_segments_for_new_part,
    _intro_should_flush,
    _strip_self_intro_prefix,
)


class _Ev:
    def __init__(self, is_set: bool = False):
        self._is_set = bool(is_set)

    def is_set(self) -> bool:
        return bool(self._is_set)


class _Logger:
    def __init__(self):
        self.infos: list[str] = []

    def info(self, msg: str) -> None:
        self.infos.append(str(msg))

    def warning(self, msg: str) -> None:  # noqa: ARG002
        return None


class _Cleaner:
    def clean_streaming_chunk(self, s: str, is_partial: bool = True) -> str:  # noqa: ARG002
        return str(s)


class _Buf:
    def __init__(self, segs: list[str]):
        self._segs = list(segs)

    def add_cleaned_chunk(self, s: str):  # noqa: ARG002
        return list(self._segs)


def _drain(gen):
    items = []
    try:
        while True:
            items.append(next(gen))
    except StopIteration as e:
        return items, e.value


def test_intro_should_flush_short_no_punct_is_false():
    assert _intro_should_flush("\u4f60\u597d\u6211\u662f\u5c0f\u52a9\u624b") is False


def test_intro_should_flush_punct_is_true():
    assert _intro_should_flush("\u4f60\u597d\uff01\u6211\u662f\u5c0f\u52a9\u624b") is True
    assert _intro_should_flush("\u4f60\u597d\n\u6211\u662f\u5c0f\u52a9\u624b") is True


def test_intro_should_flush_len_ge_30_is_true():
    assert _intro_should_flush("x" * 30) is True


def test_strip_self_intro_prefix_removes_intro_and_keeps_payload():
    s = "\u4f60\u597d\uff01\u6211\u662f\u5c0f\u52a9\u624b\uff1a\u5173\u4e8e\u5c55\u54c1A\uff0c\u91cd\u70b9\u662f..."
    assert _strip_self_intro_prefix(s) == "\u5173\u4e8e\u5c55\u54c1A\uff0c\u91cd\u70b9\u662f..."


def test_strip_self_intro_prefix_keeps_text_when_no_self_intro_present():
    s = "\u4f60\u597d\uff01\u4eca\u5929\u6211\u4eec\u8bb2\u5c55\u54c1A\u3002"
    assert _strip_self_intro_prefix(s) == s


def test_strip_self_intro_prefix_handles_here_is_pattern():
    s = "\u8fd9\u91cc\u662fRagInt\u667a\u80fd\u52a9\u624b, \u73b0\u5728\u5f00\u59cb\u56de\u7b54\uff1aA"
    assert _strip_self_intro_prefix(s).startswith("\u73b0\u5728\u5f00\u59cb\u56de\u7b54")


def test_apply_no_self_intro_prefix_buffers_until_flush():
    new_part, intro_buf, intro_checked, pending = _apply_no_self_intro_prefix(
        new_part="\u4f60\u597d\u6211\u662f\u5c0f\u52a9\u624b",
        intro_buf="",
        intro_checked=False,
    )
    assert pending is True
    assert intro_checked is False
    assert new_part == ""
    assert intro_buf


def test_apply_no_self_intro_prefix_strips_after_flush():
    new_part, intro_buf, intro_checked, pending = _apply_no_self_intro_prefix(
        new_part="\u4f60\u597d\uff01\u6211\u662f\u5c0f\u52a9\u624b\uff1a\u5f00\u59cb\u56de\u7b54A",
        intro_buf="",
        intro_checked=False,
    )
    assert pending is False
    assert intro_checked is True
    assert intro_buf == ""
    assert new_part.startswith("\u5f00\u59cb\u56de\u7b54")


def test_emit_tts_segments_cleaning_emits_and_dedupes():
    logger = _Logger()
    cancelled = _Ev(False)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _emit_tts_segments_for_new_part(
        request_id="r1",
        client_id="c1",
        t_submit=0.0,
        cancel_event=cancelled,
        logger=logger,
        timings_set=timings_set,
        new_part="hello",
        now=1.0,
        enable_cleaning=True,
        text_cleaner=_Cleaner(),
        tts_buffer=_Buf(["A", "A", "B"]),
        start_tts_on_first_chunk=False,
        first_segment_min_chars=1,
        segment_flush_interval_s=0.8,
        segment_min_chars=3,
        emitted_segments=set(),
        segment_seq=0,
        last_segment_emit_at=0.0,
        first_segment_at=None,
        carry_segment_text="",
    )
    yielded, rv = _drain(gen)
    assert [it["segment"] for it in yielded] == ["A", "B"]
    assert yielded[0]["segment_seq"] == 1
    assert yielded[1]["segment_seq"] == 2
    carry_text, seq, _last_emit, first_at, was_cancelled = rv
    assert carry_text == ""
    assert seq == 2
    assert was_cancelled is False
    assert first_at == 1.0


def test_emit_tts_segments_start_tts_on_first_chunk_bypasses_buffer_once():
    logger = _Logger()
    cancelled = _Ev(False)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _emit_tts_segments_for_new_part(
        request_id="r1",
        client_id="c1",
        t_submit=0.0,
        cancel_event=cancelled,
        logger=logger,
        timings_set=timings_set,
        new_part="hello",
        now=1.0,
        enable_cleaning=True,
        text_cleaner=_Cleaner(),
        tts_buffer=_Buf(["A"]),
        start_tts_on_first_chunk=True,
        first_segment_min_chars=1,
        segment_flush_interval_s=0.8,
        segment_min_chars=3,
        emitted_segments=set(),
        segment_seq=0,
        last_segment_emit_at=0.0,
        first_segment_at=None,
        carry_segment_text="",
    )
    yielded, rv = _drain(gen)
    assert [it["segment"] for it in yielded] == ["hello"]
    carry_text, seq, _last_emit, first_at, was_cancelled = rv
    assert carry_text == ""
    assert seq == 1
    assert was_cancelled is False
    assert first_at == 1.0


def test_emit_tts_segments_coarse_flushes_on_interval_and_min_chars():
    logger = _Logger()
    cancelled = _Ev(False)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    emitted: set[str] = set()
    gen = _emit_tts_segments_for_new_part(
        request_id="r1",
        client_id="c1",
        t_submit=0.0,
        cancel_event=cancelled,
        logger=logger,
        timings_set=timings_set,
        new_part="ab",
        now=0.1,
        enable_cleaning=False,
        text_cleaner=None,
        tts_buffer=None,
        start_tts_on_first_chunk=True,
        first_segment_min_chars=1,
        segment_flush_interval_s=0.8,
        segment_min_chars=3,
        emitted_segments=emitted,
        segment_seq=0,
        last_segment_emit_at=0.0,
        first_segment_at=None,
        carry_segment_text="",
    )
    yielded, rv = _drain(gen)
    assert yielded == []
    carry_text, seq, _last_emit, _first_at, was_cancelled = rv
    assert carry_text == "ab"
    assert seq == 0
    assert was_cancelled is False

    gen2 = _emit_tts_segments_for_new_part(
        request_id="r1",
        client_id="c1",
        t_submit=0.0,
        cancel_event=cancelled,
        logger=logger,
        timings_set=timings_set,
        new_part="c",
        now=1.0,
        enable_cleaning=False,
        text_cleaner=None,
        tts_buffer=None,
        start_tts_on_first_chunk=True,
        first_segment_min_chars=1,
        segment_flush_interval_s=0.8,
        segment_min_chars=3,
        emitted_segments=emitted,
        segment_seq=0,
        last_segment_emit_at=0.0,
        first_segment_at=None,
        carry_segment_text="ab",
    )
    yielded2, rv2 = _drain(gen2)
    assert [it["segment"] for it in yielded2] == ["abc"]
    assert yielded2[0]["segment_seq"] == 1
    carry_text2, seq2, _last_emit2, first_at2, was_cancelled2 = rv2
    assert carry_text2 == ""
    assert seq2 == 1
    assert was_cancelled2 is False
    assert first_at2 == 1.0
