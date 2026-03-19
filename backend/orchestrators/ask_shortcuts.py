from __future__ import annotations

import contextlib
import time

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


def _maybe_stream_audio_cache_hit(
    *,
    request_id: str,
    question: str,
    qa_audio_matcher,
    qa_audio_cache_enabled: bool,
    qa_audio_recall_top_k: int,
    qa_audio_classifier_threshold: float,
    qa_audio_classifier_chat_name: str,
    tts_provider: str,
    tts_voice: str,
    tts_speed: float,
    safety_filter: SensitiveWordsFilter,
    logger,
    timings_set=None,
    base_url: str = "",
):
    if not qa_audio_cache_enabled:
        return None
    if qa_audio_matcher is None:
        return None

    hit = None
    qa_match_started = False
    with contextlib.suppress(Exception):
        from backend.services.qa_audio_matcher import TtsProfile

        if callable(timings_set):
            timings_set(request_id, t_qa_match_start_ms=int(time.time() * 1000))
            qa_match_started = True

        hit = qa_audio_matcher.find_match(
            question=question,
            tts_profile=TtsProfile(provider=str(tts_provider or ""), voice=str(tts_voice or ""), speed=float(tts_speed or 1.0)),
            top_k=max(1, int(qa_audio_recall_top_k or 20)),
            threshold=float(qa_audio_classifier_threshold or 0.85),
            classifier_chat_name=str(qa_audio_classifier_chat_name or "问题比对"),
            base_url=str(base_url or ""),
        )

    if qa_match_started and callable(timings_set):
        with contextlib.suppress(Exception):
            timings_set(request_id, t_qa_match_end_ms=int(time.time() * 1000))

    if not hit:
        return None

    answer = str((hit or {}).get("answer_text") or "").strip()
    audio_url = str((hit or {}).get("audio_url") or "").strip()
    if not answer or not audio_url:
        return None

    if getattr(safety_filter, "enabled", False) and safety_filter.match_text(answer):
        logger.warning(f"[{request_id}] safety_skip_audio_cache_hit")
        return None

    payload = {
        "pair_id": int((hit or {}).get("pair_id") or 0),
        "audio_url": audio_url,
        "answer_text": answer,
        "confidence": float((hit or {}).get("confidence") or 0.0),
        "recall_score": float((hit or {}).get("recall_score") or 0.0),
        "reason": str((hit or {}).get("reason") or ""),
    }
    yield make_chunk(answer, audio_hit=payload, cache={"hit": True, "type": "qa_audio"})
    yield make_done(cache={"hit": True, "type": "qa_audio"})
    return AskStreamOutcome(answer=answer, done_sent=True, save_allowed=True)


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
    if intent.intent not in ("complaint", "chitchat") or float(intent.confidence) < 0.78:
        return None

    if intent.intent == "complaint":
        fast_answer = (
            "非常抱歉给你带来不好的体验。\n"
            "为了尽快帮你解决，请告诉我：发生了什么、在什么位置、哪个环节，以及你希望的处理方式。\n"
            "如果需要，我也可以引导你到服务台或联系现场工作人员。"
        )
    else:
        fast_answer = "你好！我在。你可以直接问我展厅、产品相关问题，或说“开始讲解”。"

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
