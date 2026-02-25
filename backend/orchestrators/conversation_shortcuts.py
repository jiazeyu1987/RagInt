from __future__ import annotations

from backend.orchestrators.ask_shortcuts import _maybe_stream_cache_hit, _maybe_stream_fast_intent


def _maybe_stream_cache_shortcut(
    *,
    request_id: str,
    question: str,
    kb_version: str,
    cache_enabled: bool,
    safety_filter,
    history_store,
    logger,
):
    return (
        yield from _maybe_stream_cache_hit(
            request_id=request_id,
            question=question,
            kb_version=kb_version,
            cache_enabled=cache_enabled,
            safety_filter=safety_filter,
            history_store=history_store,
            logger=logger,
        )
    )


def _maybe_stream_fast_intent_shortcut(
    *,
    request_id: str,
    intent,
    apply_qa_constraints: bool,
    qa_max_answer_chars: int,
    safety_filter,
    safety_block_msg: str,
    logger,
):
    return (
        yield from _maybe_stream_fast_intent(
            request_id=request_id,
            intent=intent,
            apply_qa_constraints=apply_qa_constraints,
            qa_max_answer_chars=qa_max_answer_chars,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
            logger=logger,
        )
    )
