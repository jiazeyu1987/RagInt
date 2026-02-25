from __future__ import annotations

import contextlib

from backend.orchestrators.ragflow_streaming_helpers import _trim_answer_for_constraints
from backend.orchestrators.ragflow_streaming_models import AskStreamOutcome
from backend.orchestrators.stream_payloads import make_chunk, make_done
from backend.services.safety_filter import SensitiveWordsFilter


def _maybe_stream_cache_hit(
    *,
    request_id: str,
    question: str,
    kb_version: str,
    cache_enabled: bool,
    safety_filter: SensitiveWordsFilter,
    history_store,
    logger,
):
    if not (cache_enabled and kb_version and hasattr(history_store, "cache_get")):
        return None

    cached_answer = None
    with contextlib.suppress(Exception):
        cached_answer = history_store.cache_get(question=question, kb_version=kb_version)

    if cached_answer:
        cached_answer = str(cached_answer or "")
        if getattr(safety_filter, "enabled", False) and safety_filter.match_text(cached_answer):
            logger.warning(f"[{request_id}] safety_skip_cache_hit kb_version={kb_version!r}")
            cached_answer = ""

    if not cached_answer:
        return None

    yield make_chunk(cached_answer, cache={"hit": True, "kb_version": kb_version})
    yield make_done(cache={"hit": True, "kb_version": kb_version})
    return AskStreamOutcome(answer=str(cached_answer or ""), done_sent=True, save_allowed=True)


def _maybe_stream_fast_intent(
    *,
    request_id: str,
    intent,
    apply_qa_constraints: bool,
    qa_max_answer_chars: int,
    safety_filter: SensitiveWordsFilter,
    safety_block_msg: str,
    logger,
):
    if intent.intent not in ("direction", "complaint", "chitchat") or float(intent.confidence) < 0.78:
        return None

    if intent.intent == "direction":
        fast_answer = (
            "我可以帮你指路～\n"
            "请告诉我你要去的目标位置（例如：某展位/厕所/出口/前台），以及你现在大概在什么位置（例如：入口/某展区）。\n"
            "我会给你最短路线，并提示沿途的明显标识。"
        )
    elif intent.intent == "complaint":
        fast_answer = (
            "非常抱歉给你带来不好的体验。\n"
            "为了尽快帮你解决，请告诉我：发生了什么、在什么位置/哪个环节、以及你希望的处理方式。\n"
            "如果需要，我也可以引导你到服务台或联系现场工作人员。"
        )
    else:
        fast_answer = "你好！我在～你可以直接问我展厅/产品相关问题，或说“开始讲解”。"

    fast_answer = _trim_answer_for_constraints(
        fast_answer, apply_qa_constraints=apply_qa_constraints, qa_max_answer_chars=qa_max_answer_chars
    )

    if getattr(safety_filter, "enabled", False) and safety_filter.match_text(fast_answer):
        logger.warning(f"[{request_id}] safety_block_fast_answer")
        yield make_chunk(safety_block_msg, safety={"blocked": True, "where": "output"})
        yield make_done(safety={"blocked": True, "where": "output"})
        return AskStreamOutcome(answer="", blocked=True, done_sent=True, save_allowed=False)

    yield make_chunk(fast_answer)
    yield make_done()
    return AskStreamOutcome(answer=str(fast_answer or ""), done_sent=True, save_allowed=True)
