from __future__ import annotations

import contextlib
import re

from backend.orchestrators.stream_payloads import make_segment
from backend.services.safety_filter import SensitiveWordsFilter

_INTRO_FLUSH_PUNCT = ("\n", "\u3002", "\uff01", "!", "\uff1f", "?", ".", "\uff0c", ",", "\uff1a", ":")
_SENTENCE_END_PUNCT = {"\u3002", "\uff01", "!", "\uff1f", "?", "\uff1b", ";", "\n", "\u2026"}
_SENTENCE_TAIL_PUNCT = {'"', "'", "\u201d", "\u2019", "\u300d", "\u300f", "\uff09", ")", "]", "\u3011", "\u300b"}
_SELF_INTRO_PREFIX_RE = re.compile(
    r"^\s*(\u4f60\u597d[!\uff01,\uff0c\u3002\s]*)?(\u6211\u662f|\u6211\u53eb|\u8fd9\u91cc\u662f)[^,: \uff1a\uff0c\u3002\s]{0,20}(?:\u52a9\u624b|\u673a\u5668\u4eba|AI|\u667a\u80fd\u52a9\u624b)?[,: \uff1a\uff0c\u3002\s]*"
)


def _is_think_tag_boundary_char(ch: str) -> bool:
    return ch in ("", ">", "/", " ", "\t", "\r", "\n")


def _find_token_with_boundary(lower_text: str, token: str, start: int) -> int:
    pos = lower_text.find(token, start)
    while pos >= 0:
        tail_i = pos + len(token)
        tail = lower_text[tail_i] if tail_i < len(lower_text) else ""
        if _is_think_tag_boundary_char(tail):
            return pos
        pos = lower_text.find(token, pos + 1)
    return -1


def _find_partial_think_tag_start(lower_text: str, start: int) -> int:
    lt = lower_text.rfind("<", start)
    if lt < 0:
        return -1
    suffix = lower_text[lt:]
    if "<think".startswith(suffix) or "</think".startswith(suffix):
        return lt
    return -1


class _ThinkTagStreamSanitizer:
    """
    Streaming sanitizer that removes <think>...</think> blocks, including
    blocks that span multiple chunks.
    """

    def __init__(self) -> None:
        self._in_think = False
        self._pending = ""

    def feed(self, text: str) -> str:
        data = self._pending + str(text or "")
        self._pending = ""
        if not data:
            return ""

        low = data.lower()
        out: list[str] = []
        i = 0

        while i < len(data):
            if self._in_think:
                close_i = _find_token_with_boundary(low, "</think", i)
                if close_i < 0:
                    partial_i = _find_partial_think_tag_start(low, i)
                    self._pending = data[partial_i:] if partial_i >= 0 else ""
                    return "".join(out)
                gt = data.find(">", close_i)
                if gt < 0:
                    self._pending = data[close_i:]
                    return "".join(out)
                self._in_think = False
                i = gt + 1
                continue

            open_i = _find_token_with_boundary(low, "<think", i)
            close_i = _find_token_with_boundary(low, "</think", i)
            if open_i < 0 and close_i < 0:
                partial_i = _find_partial_think_tag_start(low, i)
                if partial_i >= 0:
                    out.append(data[i:partial_i])
                    self._pending = data[partial_i:]
                else:
                    out.append(data[i:])
                return "".join(out)

            is_close = close_i >= 0 and (open_i < 0 or close_i < open_i)
            tag_i = close_i if is_close else open_i
            out.append(data[i:tag_i])

            gt = data.find(">", tag_i)
            if gt < 0:
                self._pending = data[tag_i:]
                return "".join(out)

            if not is_close:
                tag = data[tag_i : gt + 1]
                if not tag.rstrip().endswith("/>"):
                    self._in_think = True
            i = gt + 1

        return "".join(out)

    def flush(self) -> str:
        # Pending leftovers are always partial think tags; never expose them.
        self._pending = ""
        return ""


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


def _split_complete_sentences(text: str) -> tuple[list[str], str]:
    """
    Split text into complete sentence-like segments and remaining tail.
    Sentence boundary is identified by common Chinese/English sentence-end punctuation.
    """
    src = str(text or "")
    if not src:
        return [], ""

    out: list[str] = []
    start = 0
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        if ch not in _SENTENCE_END_PUNCT:
            i += 1
            continue

        end = i + 1
        while end < n and src[end] in _SENTENCE_TAIL_PUNCT:
            end += 1

        seg = src[start:end].strip()
        if seg:
            out.append(seg)
        start = end
        i = end

    remain = src[start:]
    return out, remain


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

    # Coarse mode (no cleaner): prioritize full sentence emission to avoid mid-sentence cuts.
    sentence_segs, remain = _split_complete_sentences(carry_segment_text)
    for seg in sentence_segs:
        if seg in emitted_segments:
            continue
        emitted_segments.add(seg)
        segment_seq += 1
        last_segment_emit_at = now
        if first_segment_at is None:
            first_segment_at = now
            logger.info(f"[{request_id}] first_tts_segment dt={first_segment_at - t_submit:.3f}s chars={len(seg)}")
            timings_set(request_id, t_first_tts_segment=first_segment_at)
        yield make_segment(seg, segment_seq=segment_seq)
    carry_segment_text = remain

    # Keep the unfinished tail until it becomes a complete sentence (or stream finalize).
    if (
        not sentence_segs
        and (now - last_segment_emit_at) >= segment_flush_interval_s
        and len(carry_segment_text.strip()) >= segment_min_chars
    ):
        # Intentionally keep buffering to avoid splitting one sentence into two TTS requests.
        return carry_segment_text, segment_seq, last_segment_emit_at, first_segment_at, False
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
