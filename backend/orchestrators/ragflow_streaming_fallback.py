from __future__ import annotations

import contextlib
import time

from backend.orchestrators.ragflow_streaming_helpers import _trim_answer_for_constraints
from backend.orchestrators.ragflow_streaming_models import AskStreamOutcome
from backend.orchestrators.stream_payloads import make_chunk, make_done, make_segment
from backend.services.safety_filter import SensitiveWordsFilter


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
