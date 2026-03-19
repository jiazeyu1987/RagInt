from __future__ import annotations

import contextlib
import os
import time

from backend.orchestrators.ragflow_streaming_helpers import (
    _ThinkTagStreamSanitizer,
    _apply_no_self_intro_prefix,
    _apply_qa_max_chars_limit,
    _close_response_safely,
    _diff_stream_content,
    _emit_tts_segments_for_new_part,
    _extract_ragflow_chunk_content,
    _update_safety_stream_tail_and_check,
)
from backend.orchestrators.ragflow_streaming_models import AskStreamOutcome, RagflowStreamSettings
from backend.orchestrators.stream_payloads import make_chunk, make_done, make_segment

_ASK_TRACE_LOG_ENABLED = str(os.environ.get("RAGINT_ASK_TRACE_LOG", "0") or "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "y",
    "on",
)


def _safe_rag_nonstream_content(rag_session, question: str, logger, request_id: str) -> str:
    """
    Best-effort fallback for SDK stream protocol mismatches (e.g. missing chunk_id).
    """
    try:
        resp = rag_session.ask(question, stream=False)
    except Exception as e:  # noqa: BLE001
        logger.error(f"[{request_id}] rag_nonstream_fallback_failed err={e}", exc_info=True)
        return ""
    if hasattr(resp, "content"):
        return str(getattr(resp, "content") or "")
    if isinstance(resp, dict):
        for key in ("content", "answer", "text"):
            val = resp.get(key)
            if isinstance(val, str) and val:
                return val
    return str(resp or "")


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
    timings_set(request_id, t_ragflow_request_start=t_ragflow_request)
    response = None
    last_complete_content = ""
    last_ragflow_content = ""
    safety_stream_tail_norm = ""
    think_sanitizer = _ThinkTagStreamSanitizer()

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

        response_iter = iter(response)
        while True:
            try:
                chunk = next(response_iter)
            except StopIteration:
                break
            except KeyError as e:
                # ragflow-sdk (some versions) may assume a field (chunk_id) that is
                # missing in streamed frames. Do not abort the whole run; fallback once.
                if str(e).strip("'\"") == "chunk_id":
                    logger.warning(f"[{request_id}] rag_stream_chunk_protocol_mismatch key={e} -> fallback_nonstream")
                    fallback_content = _safe_rag_nonstream_content(
                        rag_session=rag_session,
                        question=question_for_rag,
                        logger=logger,
                        request_id=request_id,
                    )
                    if fallback_content:
                        new_part, last_ragflow_content = _diff_stream_content(
                            content=str(fallback_content), last_content=last_ragflow_content
                        )
                        new_part = think_sanitizer.feed(new_part)
                        if new_part:
                            yield make_chunk(new_part)
                            last_complete_content += new_part
                    _close_response_safely(response)
                    break
                raise
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
                if _ASK_TRACE_LOG_ENABLED:
                    preview = str(content or "").strip().replace("\n", " ")[:160]
                    logger.info(f"[{request_id}] ragflow_first_text_preview={preview!r}")
                timings_set(request_id, t_ragflow_first_text=first_ragflow_text_at)

            new_part, last_ragflow_content = _diff_stream_content(content=content, last_content=last_ragflow_content)
            new_part = think_sanitizer.feed(new_part)
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

        if _ASK_TRACE_LOG_ENABLED:
            answer_preview = str(last_complete_content or "").strip().replace("\n", " ")[:200]
            logger.info(f"[{request_id}] ragflow_stream_answer_preview={answer_preview!r}")

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
