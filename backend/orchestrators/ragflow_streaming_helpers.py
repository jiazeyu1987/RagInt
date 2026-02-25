from __future__ import annotations

import contextlib
import re

from backend.orchestrators.stream_payloads import make_segment
from backend.services.safety_filter import SensitiveWordsFilter

_INTRO_FLUSH_PUNCT = ("\n", "\u3002", "\uff01", "!", "\uff1f", "?", ".", "\uff0c", ",", "\uff1a", ":")
_SELF_INTRO_PREFIX_RE = re.compile(
    r"^\s*(\u4f60\u597d[!\uff01,\uff0c\u3002\s]*)?(\u6211\u662f|\u6211\u53eb|\u8fd9\u91cc\u662f)[^,: \uff1a\uff0c\u3002\s]{0,20}(?:\u52a9\u624b|\u673a\u5668\u4eba|AI|\u667a\u80fd\u52a9\u624b)?[,: \uff1a\uff0c\u3002\s]*"
)


def _intro_should_flush(intro_buf: str) -> bool:
    if len(intro_buf) >= 30:
        return True
    return any(ch in intro_buf for ch in _INTRO_FLUSH_PUNCT)


def _strip_self_intro_prefix(text: str) -> str:
    text = str(text or "")
    return _SELF_INTRO_PREFIX_RE.sub("", text)


def _apply_no_self_intro_prefix(*, new_part: str, intro_buf: str, intro_checked: bool) -> tuple[str, str, bool, bool]:
    """
    Returns: (new_part, intro_buf, intro_checked, pending_flush)
    - pending_flush=True means we buffered but didn't flush/strip yet; caller should `continue`.
    """
    if intro_checked:
        return new_part, intro_buf, intro_checked, False
    intro_buf = (intro_buf or "") + (new_part or "")
    if not _intro_should_flush(intro_buf):
        return "", intro_buf, intro_checked, True
    new_part = _strip_self_intro_prefix(intro_buf)
    return new_part, "", True, False


def _extract_ragflow_chunk_content(chunk, *, agent_id: str, last_ragflow_content: str, logger) -> str | None:
    content = None
    if agent_id:
        if isinstance(chunk, str):
            content = last_ragflow_content + chunk
        else:
            content = str(chunk) if chunk is not None else ""
    elif chunk and hasattr(chunk, "content"):
        content = chunk.content
    elif isinstance(chunk, dict) and "content" in chunk:
        content = chunk.get("content")
    else:
        logger.warning(f"Chunk没有content属性? {chunk}")
    if content is None:
        return None
    return str(content)


def _diff_stream_content(*, content: str, last_content: str) -> tuple[str, str]:
    if content.startswith(last_content):
        return content[len(last_content) :], content
    return content, content


def _emit_tts_segments_for_new_part(
    *,
    request_id: str,
    client_id: str,
    t_submit: float,
    cancel_event,
    logger,
    timings_set,
    new_part: str,
    now: float,
    enable_cleaning: bool,
    text_cleaner,
    tts_buffer,
    start_tts_on_first_chunk: bool,
    first_segment_min_chars: int,
    segment_flush_interval_s: float,
    segment_min_chars: int,
    emitted_segments: set[str],
    segment_seq: int,
    last_segment_emit_at: float,
    first_segment_at: float | None,
    carry_segment_text: str,
):
    """
    Returns: (carry_segment_text, segment_seq, last_segment_emit_at, first_segment_at, cancelled)
    """
    if cancel_event.is_set():
        logger.info(f"[{request_id}] ask_cancelled_during_tts_segment_emit client_id={client_id}")
        return carry_segment_text, segment_seq, last_segment_emit_at, first_segment_at, True

    if enable_cleaning and text_cleaner and tts_buffer:
        cleaned = text_cleaner.clean_streaming_chunk(new_part, is_partial=True)
        cleaned_stripped = cleaned.strip()
        if start_tts_on_first_chunk and first_segment_at is None and len(cleaned_stripped) >= first_segment_min_chars:
            segs = [cleaned_stripped]
        else:
            segs = list(tts_buffer.add_cleaned_chunk(cleaned))

        for seg in segs:
            if cancel_event.is_set():
                logger.info(f"[{request_id}] ask_cancelled_during_tts_buffer_add client_id={client_id}")
                return carry_segment_text, segment_seq, last_segment_emit_at, first_segment_at, True
            seg = str(seg or "").strip()
            if not seg or seg in emitted_segments:
                continue
            emitted_segments.add(seg)
            segment_seq += 1
            last_segment_emit_at = now
            if first_segment_at is None:
                first_segment_at = now
                logger.info(f"[{request_id}] first_tts_segment dt={first_segment_at - t_submit:.3f}s chars={len(seg)}")
                timings_set(request_id, t_first_tts_segment=first_segment_at)
            yield make_segment(seg, segment_seq=segment_seq)
        return carry_segment_text, segment_seq, last_segment_emit_at, first_segment_at, False

    carry_segment_text = (carry_segment_text or "") + (new_part or "")
    if (now - last_segment_emit_at) >= segment_flush_interval_s and len(carry_segment_text.strip()) >= segment_min_chars:
        seg = carry_segment_text.strip()
        if seg and seg not in emitted_segments:
            emitted_segments.add(seg)
            segment_seq += 1
            last_segment_emit_at = now
            if first_segment_at is None:
                first_segment_at = now
                logger.info(f"[{request_id}] first_tts_segment dt={first_segment_at - t_submit:.3f}s chars={len(seg)}")
                timings_set(request_id, t_first_tts_segment=first_segment_at)
            yield make_segment(seg, segment_seq=segment_seq)
        carry_segment_text = ""
    return carry_segment_text, segment_seq, last_segment_emit_at, first_segment_at, False


def _close_response_safely(response) -> None:
    with contextlib.suppress(Exception):
        getattr(response, "close")()


def _apply_qa_max_chars_limit(*, new_part: str, current_answer_len: int, qa_max_answer_chars: int) -> tuple[str, bool, bool]:
    if qa_max_answer_chars <= 0:
        return new_part, False, False
    remaining = qa_max_answer_chars - int(current_answer_len)
    if remaining <= 0:
        return "", True, False
    if len(new_part) > remaining:
        return new_part[:remaining], False, True
    return new_part, False, False


def _update_safety_stream_tail_and_check(
    *,
    safety_filter: SensitiveWordsFilter,
    tail_norm: str,
    new_text: str,
) -> tuple[str | None, str]:
    if not (getattr(safety_filter, "enabled", False) and new_text):
        return None, tail_norm
    matched, new_tail_norm = safety_filter.update_stream_tail_and_match(tail_norm=tail_norm, new_text=new_text)
    if matched:
        return str(matched), new_tail_norm
    return None, new_tail_norm


def _trim_answer_for_constraints(s: str, *, apply_qa_constraints: bool, qa_max_answer_chars: int) -> str:
    if not apply_qa_constraints or qa_max_answer_chars <= 0:
        return str(s or "")
    s = str(s or "")
    return s[:qa_max_answer_chars]
