from __future__ import annotations

import contextlib
import re
import time
from dataclasses import dataclass

from backend.services.safety_filter import SensitiveWordsFilter
from backend.orchestrators.stream_payloads import make_chunk, make_done, make_segment


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

    # coarse mode: only flush on interval + min chars
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


@dataclass(frozen=True)
class AskStreamOutcome:
    answer: str
    blocked: bool = False
    cancelled: bool = False
    done_sent: bool = True
    save_allowed: bool = True
    cache_put_allowed: bool = False


@dataclass(frozen=True)
class RagflowStreamSettings:
    apply_qa_constraints: bool
    qa_no_self_intro: bool
    qa_max_answer_chars: int
    safety_filter: SensitiveWordsFilter
    safety_block_msg: str
    enable_cleaning: bool
    text_cleaner: object | None
    tts_buffer: object | None
    start_tts_on_first_chunk: bool
    first_segment_min_chars: int
    segment_flush_interval_s: float
    segment_min_chars: int


def _trim_answer_for_constraints(s: str, *, apply_qa_constraints: bool, qa_max_answer_chars: int) -> str:
    if not apply_qa_constraints or qa_max_answer_chars <= 0:
        return str(s or "")
    s = str(s or "")
    return s[:qa_max_answer_chars]


def _stream_ragflow_unavailable_fallback(
    *,
    request_id: str,
    client_id: str,
    question: str,
    cancel_event,
    logger,
    apply_qa_constraints: bool,
    qa_max_answer_chars: int,
    safety_filter: SensitiveWordsFilter,
    safety_block_msg: str,
    text_cleaner,
    tts_buffer,
    sleep_s: float = 0.05,
    sleep_fn=time.sleep,
):
    logger.warning("RAGFlow不可用，使用固定回答")
    fallback_answer = (
        f"我收到了你的问题：{question}。由于RAGFlow服务暂时不可用，我现在只能给你一个固定的回答。请确保RAGFlow服务正在运行。"
    )
    last_complete_content = _trim_answer_for_constraints(
        fallback_answer, apply_qa_constraints=apply_qa_constraints, qa_max_answer_chars=qa_max_answer_chars
    )

    blocked_fallback = False
    if getattr(safety_filter, "enabled", False) and safety_filter.match_text(last_complete_content):
        blocked_fallback = True
        last_complete_content = safety_block_msg

    emitted_segments: set[str] = set()
    for char in last_complete_content:
        if cancel_event.is_set():
            logger.info(f"[{request_id}] ask_cancelled_during_fallback client_id={client_id}")
            return AskStreamOutcome(
                answer=str(last_complete_content or ""),
                cancelled=True,
                done_sent=False,
                save_allowed=False,
            )
        yield make_chunk(char)
        if text_cleaner and tts_buffer:
            cleaned = text_cleaner.clean_streaming_chunk(char, is_partial=True)
            for seg in tts_buffer.add_cleaned_chunk(cleaned):
                seg = seg.strip()
                if not seg or seg in emitted_segments:
                    continue
                emitted_segments.add(seg)
                yield make_segment(seg)
        with contextlib.suppress(Exception):
            sleep_fn(float(sleep_s))

    if text_cleaner and tts_buffer:
        for seg in tts_buffer.finalize():
            if cancel_event.is_set():
                logger.info(f"[{request_id}] ask_cancelled_during_finalize client_id={client_id}")
                return AskStreamOutcome(
                    answer=str(last_complete_content or ""),
                    cancelled=True,
                    done_sent=False,
                    save_allowed=False,
                )
            seg = seg.strip()
            if not seg or seg in emitted_segments:
                continue
            emitted_segments.add(seg)
            yield make_segment(seg)

    yield make_done()
    return AskStreamOutcome(
        answer=str(last_complete_content or ""),
        blocked=bool(blocked_fallback),
        cancelled=False,
        done_sent=True,
        save_allowed=not blocked_fallback,
    )


def _stream_ragflow_response(
    *,
    request_id: str,
    client_id: str,
    agent_id: str,
    question_for_rag: str,
    rag_session,
    ragflow_agent_service,
    cancel_event,
    t_submit: float,
    logger,
    timings_set,
    settings: RagflowStreamSettings,
):
    t_ragflow_request = time.perf_counter()
    response = None
    last_complete_content = ""
    last_ragflow_content = ""
    safety_stream_tail_norm = ""

    try:
        if agent_id:
            logger.info(f"[{request_id}] 开始RAGFlow Agent流式响应 agent_id={agent_id}")
            try:
                response = ragflow_agent_service.stream_completion_text(
                    agent_id, question_for_rag, request_id=request_id, cancel_event=cancel_event
                )
            except Exception as e:
                logger.error(f"[{request_id}] ragflow_agent_stream_init_failed err={e}", exc_info=True)
                msg = (
                    f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。"
                    f"请检查 RAGFlow 服务日志/版本或接口权限。"
                )
                yield make_chunk(msg)
                yield make_done()
                return AskStreamOutcome(answer="", done_sent=True, save_allowed=False)
        else:
            logger.info(f"[{request_id}] 开始RAGFlow流式响应")
            response = rag_session.ask(question_for_rag, stream=True)
            logger.info(f"[{request_id}] RAGFlow响应对象创建成功 dt={time.perf_counter() - t_ragflow_request:.3f}s")

        chunk_count = 0
        first_ragflow_chunk_at = None
        first_ragflow_text_at = None
        first_segment_at: float | None = None
        carry_segment_text = ""
        intro_buf = ""
        intro_checked = not (settings.apply_qa_constraints and settings.qa_no_self_intro)

        emitted_segments: set[str] = set()
        last_segment_emit_at = t_submit
        segment_seq = 0

        for chunk in response:
            if cancel_event.is_set():
                logger.info(f"[{request_id}] ask_cancelled_during_rag_stream client_id={client_id}")
                _close_response_safely(response)
                break

            chunk_count += 1
            if first_ragflow_chunk_at is None:
                first_ragflow_chunk_at = time.perf_counter()
                logger.info(
                    f"[{request_id}] ragflow_first_chunk dt={first_ragflow_chunk_at - t_submit:.3f}s chunk_type={type(chunk)}"
                )
                timings_set(request_id, t_ragflow_first_chunk=first_ragflow_chunk_at)

            content = _extract_ragflow_chunk_content(
                chunk, agent_id=agent_id, last_ragflow_content=last_ragflow_content, logger=logger
            )
            if content is None:
                continue

            if first_ragflow_text_at is None and content.strip():
                first_ragflow_text_at = time.perf_counter()
                logger.info(
                    f"[{request_id}] ragflow_first_text dt={first_ragflow_text_at - t_submit:.3f}s chars={len(content.strip())}"
                )
                timings_set(request_id, t_ragflow_first_text=first_ragflow_text_at)

            new_part, last_ragflow_content = _diff_stream_content(content=content, last_content=last_ragflow_content)
            if not new_part:
                continue

            if settings.apply_qa_constraints and settings.qa_no_self_intro and not intro_checked:
                new_part, intro_buf, intro_checked, pending_flush = _apply_no_self_intro_prefix(
                    new_part=new_part, intro_buf=intro_buf, intro_checked=intro_checked
                )
                if pending_flush:
                    continue
                if not new_part:
                    continue

            stop_after_emit = False
            if settings.apply_qa_constraints and settings.qa_max_answer_chars > 0:
                new_part, stop_before_emit, stop_after_emit = _apply_qa_max_chars_limit(
                    new_part=new_part,
                    current_answer_len=len(last_complete_content),
                    qa_max_answer_chars=settings.qa_max_answer_chars,
                )
                if stop_before_emit:
                    _close_response_safely(response)
                    break
                if not new_part:
                    continue

            if getattr(settings.safety_filter, "enabled", False) and new_part:
                matched, safety_stream_tail_norm = _update_safety_stream_tail_and_check(
                    safety_filter=settings.safety_filter, tail_norm=safety_stream_tail_norm, new_text=new_part
                )
                if matched:
                    logger.warning(f"[{request_id}] safety_block_output term={matched!r}")
                    _close_response_safely(response)
                    yield make_chunk(settings.safety_block_msg, safety={"blocked": True, "where": "output"})
                    yield make_done(safety={"blocked": True, "where": "output"})
                    return AskStreamOutcome(answer="", blocked=True, done_sent=True, save_allowed=False)

            yield make_chunk(new_part)
            if cancel_event.is_set():
                logger.info(f"[{request_id}] ask_cancelled_after_chunk_emit client_id={client_id}")
                _close_response_safely(response)
                return AskStreamOutcome(
                    answer=last_complete_content + new_part,
                    cancelled=True,
                    done_sent=False,
                    save_allowed=False,
                    cache_put_allowed=False,
                )

            now = time.perf_counter()
            carry_segment_text, segment_seq, last_segment_emit_at, first_segment_at, cancelled = yield from _emit_tts_segments_for_new_part(
                request_id=request_id,
                client_id=client_id,
                t_submit=t_submit,
                cancel_event=cancel_event,
                logger=logger,
                timings_set=timings_set,
                new_part=new_part,
                now=now,
                enable_cleaning=settings.enable_cleaning,
                text_cleaner=settings.text_cleaner,
                tts_buffer=settings.tts_buffer,
                start_tts_on_first_chunk=settings.start_tts_on_first_chunk,
                first_segment_min_chars=settings.first_segment_min_chars,
                segment_flush_interval_s=settings.segment_flush_interval_s,
                segment_min_chars=settings.segment_min_chars,
                emitted_segments=emitted_segments,
                segment_seq=segment_seq,
                last_segment_emit_at=last_segment_emit_at,
                first_segment_at=first_segment_at,
                carry_segment_text=carry_segment_text,
            )
            if cancelled:
                return AskStreamOutcome(
                    answer=last_complete_content,
                    cancelled=True,
                    done_sent=False,
                    save_allowed=False,
                )

            last_complete_content += new_part
            if stop_after_emit:
                _close_response_safely(response)
                break

            if (
                settings.apply_qa_constraints
                and settings.qa_max_answer_chars > 0
                and len(last_complete_content) >= settings.qa_max_answer_chars
            ):
                _close_response_safely(response)
                break

        logger.info(
            f"[{request_id}] 流式响应结束 total_dt={time.perf_counter() - t_submit:.3f}s total_chunks={chunk_count}"
        )

        if settings.text_cleaner and settings.tts_buffer:
            if carry_segment_text:
                with contextlib.suppress(Exception):
                    settings.tts_buffer.current_sentence = (
                        carry_segment_text + " " + (settings.tts_buffer.current_sentence or "")
                    ).strip()
                carry_segment_text = ""
            for seg in settings.tts_buffer.finalize():
                if cancel_event.is_set():
                    logger.info(f"[{request_id}] ask_cancelled_after_rag_finalize client_id={client_id}")
                    return AskStreamOutcome(
                        answer=last_complete_content,
                        cancelled=True,
                        done_sent=False,
                        save_allowed=False,
                    )
                seg = seg.strip()
                if not seg or seg in emitted_segments:
                    continue
                emitted_segments.add(seg)
                if first_segment_at is None:
                    first_segment_at = time.perf_counter()
                    logger.info(
                        f"[{request_id}] first_tts_segment_finalize dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                    )
                    timings_set(request_id, t_first_tts_segment=first_segment_at)
                yield make_segment(seg)

        done_sent = False
        if not cancel_event.is_set():
            yield make_done()
            done_sent = True

        cancelled = bool(cancel_event.is_set())
        cache_put_allowed = (not cancelled) and bool(str(last_complete_content or "").strip())
        return AskStreamOutcome(
            answer=last_complete_content,
            cancelled=cancelled,
            done_sent=done_sent,
            save_allowed=not cancelled,
            cache_put_allowed=cache_put_allowed,
        )
    except GeneratorExit:
        logger.info(f"[{request_id}] ask_stream_generator_exit (client_disconnect?)")
        raise
    except Exception as e:
        logger.error(f"[{request_id}] 流式响应异常: {e}", exc_info=True)
        if agent_id and "ragflow_agent_completion_no_data" in str(e):
            msg = (
                f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。"
                f"请检查 RAGFlow 服务日志/版本或接口权限。"
            )
            yield make_chunk(msg, done=True)
        else:
            yield make_chunk(f"错误: {str(e)}", done=True)
        return AskStreamOutcome(answer="", done_sent=True, save_allowed=False)
