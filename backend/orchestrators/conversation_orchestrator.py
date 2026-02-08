from __future__ import annotations

import contextlib
from dataclasses import dataclass

from backend.orchestrators.guide_prompt import apply_guide_prompt
from backend.orchestrators.ask_shortcuts import _maybe_stream_cache_hit, _maybe_stream_fast_intent
from backend.orchestrators.ask_policies import apply_qa_requirements, apply_selling_points_topn_hint
from backend.orchestrators.ragflow_config import RagflowRuntimeConfig
from backend.orchestrators.ragflow_streaming import (
    AskStreamOutcome,
    RagflowStreamSettings,
    _stream_ragflow_response,
    _stream_ragflow_unavailable_fallback,
)
from backend.orchestrators.stream_payloads import make_chunk, make_done, make_meta
from backend.orchestrators.text_cleaning import _init_text_cleaning
from backend.services.safety_filter import SensitiveWordsFilter


@dataclass(frozen=True)
class AskInput:
    question: str
    request_id: str
    client_id: str
    kind: str
    agent_id: str = ""
    conversation_name: str = ""
    guide: dict | None = None
    save_history: bool = True


class ConversationOrchestrator:
    def __init__(
        self,
        *,
        ragflow_service,
        ragflow_agent_service,
        intent_service,
        history_store,
        selling_points_store=None,
        logger,
        timings_set,
        timings_get,
        default_session=None,
    ):
        self._ragflow_service = ragflow_service
        self._ragflow_agent_service = ragflow_agent_service
        self._intent_service = intent_service
        self._history_store = history_store
        self._selling_points_store = selling_points_store
        self._logger = logger
        self._timings_set = timings_set
        self._timings_get = timings_get
        self._default_session = default_session

    def _finalize(
        self,
        *,
        inp: AskInput,
        outcome: AskStreamOutcome,
        request_id: str,
        question: str,
        agent_id: str,
        conversation_name: str,
        cache_enabled: bool,
        kb_version: str,
        cache_ttl_s: float,
    ) -> None:
        if not inp.save_history:
            return
        if not outcome.save_allowed or outcome.blocked:
            return
        with contextlib.suppress(Exception):
            self._history_store.add_entry(
                request_id=request_id,
                question=question,
                answer=outcome.answer,
                mode="agent" if agent_id else "chat",
                chat_name=conversation_name,
                agent_id=agent_id,
            )
            if outcome.cache_put_allowed and cache_enabled and kb_version and hasattr(self._history_store, "cache_put"):
                with contextlib.suppress(Exception):
                    self._history_store.cache_put(
                        question=question,
                        answer=outcome.answer,
                        kb_version=kb_version,
                        ttl_s=cache_ttl_s,
                    )

    def _resolve_rag_session(self, *, agent_id: str, conversation_name: str):
        if agent_id:
            return None
        return self._ragflow_service.get_session(conversation_name) if conversation_name else self._default_session

    def _build_stream_settings(
        self,
        *,
        apply_qa_constraints: bool,
        qa_no_self_intro: bool,
        qa_max_answer_chars: int,
        safety_filter: SensitiveWordsFilter,
        safety_block_msg: str,
        text_cleaning_cfg,
    ) -> RagflowStreamSettings:
        enable_cleaning = bool(getattr(text_cleaning_cfg, "enabled", False))
        start_tts_on_first_chunk = bool(getattr(text_cleaning_cfg, "start_tts_on_first_chunk", True))
        first_segment_min_chars = int(getattr(text_cleaning_cfg, "first_segment_min_chars", 10))
        segment_flush_interval_s = float(getattr(text_cleaning_cfg, "segment_flush_interval_s", 0.8))
        segment_min_chars = int(getattr(text_cleaning_cfg, "segment_min_chars", first_segment_min_chars))

        text_cleaner, tts_buffer, enable_cleaning = _init_text_cleaning(text_cleaning_cfg, logger=self._logger)
        return RagflowStreamSettings(
            apply_qa_constraints=apply_qa_constraints,
            qa_no_self_intro=qa_no_self_intro,
            qa_max_answer_chars=qa_max_answer_chars,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
            enable_cleaning=enable_cleaning,
            text_cleaner=text_cleaner,
            tts_buffer=tts_buffer,
            start_tts_on_first_chunk=start_tts_on_first_chunk,
            first_segment_min_chars=first_segment_min_chars,
            segment_flush_interval_s=segment_flush_interval_s,
            segment_min_chars=segment_min_chars,
        )

    def stream_ask(self, *, inp: AskInput, ragflow_config: dict | None, cancel_event, t_submit: float):
        question = (inp.question or "").strip()
        request_id = inp.request_id
        client_id = inp.client_id
        kind = inp.kind
        agent_id = (inp.agent_id or "").strip()
        conversation_name = (inp.conversation_name or "").strip()
        guide = inp.guide if isinstance(inp.guide, dict) else {}

        if cancel_event.is_set():
            self._logger.info(f"[{request_id}] ask_cancelled_before_start client_id={client_id}")
            return

        intent = self._intent_service.classify(question)
        self._logger.info(
            f"[{request_id}] intent_detected intent={intent.intent} conf={intent.confidence:.2f} matched={list(intent.matched)} reason={intent.reason}"
        )

        yield make_meta(
            {
                "intent": intent.intent,
                "intent_confidence": round(float(intent.confidence), 3),
                "intent_matched": list(intent.matched),
                "intent_reason": intent.reason,
                "client_id": client_id,
                "kind": kind,
            }
        )

        cfg = RagflowRuntimeConfig.from_any(ragflow_config)
        ragflow_config = cfg.raw
        safety_filter = SensitiveWordsFilter.from_config(ragflow_config)
        safety_block_msg = "抱歉，你的内容可能涉及敏感信息，我无法回答。"
        kb_version = cfg.kb_version

        if safety_filter.enabled:
            matched = safety_filter.match_text(question)
            if matched:
                self._logger.warning(f"[{request_id}] safety_block_input term={matched!r}")
                yield make_chunk(safety_block_msg, safety={"blocked": True, "where": "input"})
                yield make_done(safety={"blocked": True, "where": "input"})
                return

        cache_enabled = bool(cfg.qa_cache.enabled)
        cache_ttl_s = float(cfg.qa_cache.ttl_s)

        cache_outcome = yield from _maybe_stream_cache_hit(
            request_id=request_id,
            question=question,
            kb_version=kb_version,
            cache_enabled=cache_enabled,
            safety_filter=safety_filter,
            history_store=self._history_store,
            logger=self._logger,
        )
        if cache_outcome is not None:
            self._finalize(
                inp=inp,
                outcome=cache_outcome,
                request_id=request_id,
                question=question,
                agent_id=agent_id,
                conversation_name=conversation_name,
                cache_enabled=cache_enabled,
                kb_version=kb_version,
                cache_ttl_s=cache_ttl_s,
            )
            return

        question_for_rag = apply_guide_prompt(raw_question=question, guide=guide)

        text_cleaning_cfg = cfg.text_cleaning

        qa_constraints_enabled = bool(cfg.qa_constraints.enabled)
        qa_no_self_intro = bool(cfg.qa_constraints.no_self_intro)
        qa_max_answer_chars = int(cfg.qa_constraints.max_answer_chars)
        apply_qa_constraints = qa_constraints_enabled and (not bool(guide.get("enabled", False)))

        question_for_rag = apply_qa_requirements(
            question_for_rag,
            apply=apply_qa_constraints,
            no_self_intro=qa_no_self_intro,
            max_answer_chars=qa_max_answer_chars,
        )
        question_for_rag = apply_selling_points_topn_hint(
            question_for_rag,
            guide=guide,
            selling_points_store=self._selling_points_store,
            logger=self._logger,
        )

        fast_outcome = yield from _maybe_stream_fast_intent(
            request_id=request_id,
            intent=intent,
            apply_qa_constraints=apply_qa_constraints,
            qa_max_answer_chars=qa_max_answer_chars,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
            logger=self._logger,
        )
        if fast_outcome is not None:
            self._finalize(
                inp=inp,
                outcome=fast_outcome,
                request_id=request_id,
                question=question,
                agent_id=agent_id,
                conversation_name=conversation_name,
                cache_enabled=cache_enabled,
                kb_version=kb_version,
                cache_ttl_s=cache_ttl_s,
            )
            return

        rag_session = self._resolve_rag_session(agent_id=agent_id, conversation_name=conversation_name)

        settings = self._build_stream_settings(
            apply_qa_constraints=apply_qa_constraints,
            qa_no_self_intro=qa_no_self_intro,
            qa_max_answer_chars=qa_max_answer_chars,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
            text_cleaning_cfg=text_cleaning_cfg,
        )
        if not agent_id and not rag_session:
            unavailable_outcome = yield from _stream_ragflow_unavailable_fallback(
                request_id=request_id,
                client_id=client_id,
                question=question,
                cancel_event=cancel_event,
                logger=self._logger,
                apply_qa_constraints=apply_qa_constraints,
                qa_max_answer_chars=qa_max_answer_chars,
                safety_filter=safety_filter,
                safety_block_msg=safety_block_msg,
                text_cleaner=settings.text_cleaner,
                tts_buffer=settings.tts_buffer,
            )
            self._finalize(
                inp=inp,
                outcome=unavailable_outcome,
                request_id=request_id,
                question=question,
                agent_id=agent_id,
                conversation_name=conversation_name,
                cache_enabled=cache_enabled,
                kb_version=kb_version,
                cache_ttl_s=cache_ttl_s,
            )
            return

        stream_outcome = yield from _stream_ragflow_response(
            request_id=request_id,
            client_id=client_id,
            agent_id=agent_id,
            question_for_rag=question_for_rag,
            rag_session=rag_session,
            ragflow_agent_service=self._ragflow_agent_service,
            cancel_event=cancel_event,
            t_submit=t_submit,
            logger=self._logger,
            timings_set=self._timings_set,
            settings=settings,
        )
        self._finalize(
            inp=inp,
            outcome=stream_outcome,
            request_id=request_id,
            question=question,
            agent_id=agent_id,
            conversation_name=conversation_name,
            cache_enabled=cache_enabled,
            kb_version=kb_version,
            cache_ttl_s=cache_ttl_s,
        )
        return
