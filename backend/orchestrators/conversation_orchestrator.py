from __future__ import annotations

import contextlib
from dataclasses import dataclass

from backend.orchestrators.ask_policies import apply_qa_requirements, apply_selling_points_topn_hint
from backend.orchestrators.conversation_intent import detect_intent_and_meta
from backend.orchestrators.conversation_shortcuts import (
    _maybe_stream_audio_cache_shortcut,
    _maybe_stream_cache_shortcut,
    _maybe_stream_fast_intent_shortcut,
)
from backend.orchestrators.guide_prompt import apply_guide_prompt
from backend.orchestrators.question_prompting import apply_explanation_script_requirements, extract_base_question
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
    recording_id: str | None = None
    tts_provider: str | None = None
    tts_voice: str | None = None
    tts_speed: float | None = None


@dataclass(frozen=True)
class AskRuntime:
    cfg: RagflowRuntimeConfig
    safety_filter: SensitiveWordsFilter
    safety_block_msg: str
    kb_version: str
    cache_enabled: bool
    cache_ttl_s: float
    qa_audio_cache_enabled: bool
    qa_audio_recall_top_k: int
    qa_audio_classifier_threshold: float
    qa_audio_classifier_chat_name: str


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
        qa_audio_matcher=None,
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
        self._qa_audio_matcher = qa_audio_matcher

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
        app_config: dict,
        qa_audio_cache_enabled: bool,
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

            if (
                outcome.cache_put_allowed
                and qa_audio_cache_enabled
                and self._qa_audio_matcher is not None
                and not str(inp.recording_id or "").strip()
                and str(inp.tts_provider or "").strip()
            ):
                with contextlib.suppress(Exception):
                    from backend.services.qa_audio_matcher import TtsProfile

                    self._qa_audio_matcher.schedule_upsert_from_answer(
                        question=question,
                        answer=outcome.answer,
                        request_id=request_id,
                        tts_profile=TtsProfile(
                            provider=str(inp.tts_provider or "").strip(),
                            voice=str(inp.tts_voice or "").strip(),
                            speed=float(inp.tts_speed if inp.tts_speed is not None else 1.0),
                        ),
                        app_config=app_config if isinstance(app_config, dict) else {},
                    )

    def _resolve_rag_session(self, *, agent_id: str, conversation_name: str):
        if agent_id:
            return None
        return self._ragflow_service.get_session(conversation_name) if conversation_name else self._default_session

    def _finalize_for_request(
        self,
        *,
        inp: AskInput,
        outcome: AskStreamOutcome,
        question: str,
        agent_id: str,
        conversation_name: str,
        cache_enabled: bool,
        kb_version: str,
        cache_ttl_s: float,
        app_config: dict,
        qa_audio_cache_enabled: bool,
    ) -> None:
        self._finalize(
            inp=inp,
            outcome=outcome,
            request_id=inp.request_id,
            question=question,
            agent_id=agent_id,
            conversation_name=conversation_name,
            cache_enabled=cache_enabled,
            kb_version=kb_version,
            cache_ttl_s=cache_ttl_s,
            app_config=app_config,
            qa_audio_cache_enabled=qa_audio_cache_enabled,
        )

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

    def _build_qa_inputs(self, *, cfg: RagflowRuntimeConfig, question: str, guide: dict) -> tuple[str, bool, bool, int]:
        question_for_rag = apply_guide_prompt(raw_question=question, guide=guide)
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
        question_for_rag = apply_explanation_script_requirements(question_for_rag, enabled=True)
        return question_for_rag, apply_qa_constraints, qa_no_self_intro, qa_max_answer_chars

    def _build_runtime(self, *, ragflow_config: dict | None) -> AskRuntime:
        cfg = RagflowRuntimeConfig.from_any(ragflow_config)
        raw_cfg = cfg.raw
        safety_filter = SensitiveWordsFilter.from_config(raw_cfg)
        safety_block_msg = "抱歉，你的内容可能涉及敏感信息，我无法回答。"
        kb_version = cfg.kb_version
        cache_enabled = bool(cfg.qa_cache.enabled)
        cache_ttl_s = float(cfg.qa_cache.ttl_s)
        qa_audio_cache_enabled = bool(cfg.qa_audio_cache.enabled)
        qa_audio_recall_top_k = int(cfg.qa_audio_cache.recall_top_k)
        qa_audio_classifier_threshold = float(cfg.qa_audio_cache.classifier_threshold)
        qa_audio_classifier_chat_name = str(cfg.qa_audio_cache.classifier_chat_name or "__qa_audio_classifier__").strip()
        return AskRuntime(
            cfg=cfg,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
            kb_version=kb_version,
            cache_enabled=cache_enabled,
            cache_ttl_s=cache_ttl_s,
            qa_audio_cache_enabled=qa_audio_cache_enabled,
            qa_audio_recall_top_k=qa_audio_recall_top_k,
            qa_audio_classifier_threshold=qa_audio_classifier_threshold,
            qa_audio_classifier_chat_name=qa_audio_classifier_chat_name or "__qa_audio_classifier__",
        )

    def _maybe_block_input(self, *, request_id: str, question: str, safety_filter: SensitiveWordsFilter, safety_block_msg: str):
        if not safety_filter.enabled:
            return False
        matched = safety_filter.match_text(question)
        if not matched:
            return False
        self._logger.warning(f"[{request_id}] safety_block_input term={matched!r}")
        yield make_chunk(safety_block_msg, safety={"blocked": True, "where": "input"})
        yield make_done(safety={"blocked": True, "where": "input"})
        return True

    def _stream_with_session(
        self,
        *,
        request_id: str,
        client_id: str,
        question: str,
        agent_id: str,
        question_for_rag: str,
        rag_session,
        cancel_event,
        t_submit: float,
        settings: RagflowStreamSettings,
        apply_qa_constraints: bool,
        qa_max_answer_chars: int,
        safety_filter: SensitiveWordsFilter,
        safety_block_msg: str,
    ):
        if not agent_id and not rag_session:
            return (
                yield from _stream_ragflow_unavailable_fallback(
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
            )

        return (
            yield from _stream_ragflow_response(
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
        )

    def stream_ask(self, *, inp: AskInput, ragflow_config: dict | None, cancel_event, t_submit: float):
        question_raw = (inp.question or "").strip()
        question = extract_base_question(question_raw) or question_raw
        request_id = inp.request_id
        client_id = inp.client_id
        kind = inp.kind
        agent_id = (inp.agent_id or "").strip()
        conversation_name = (inp.conversation_name or "").strip()
        guide = inp.guide if isinstance(inp.guide, dict) else {}

        if cancel_event.is_set():
            self._logger.info(f"[{request_id}] ask_cancelled_before_start client_id={client_id}")
            return

        intent, meta = detect_intent_and_meta(
            intent_service=self._intent_service,
            question=question_raw,
            request_id=request_id,
            client_id=client_id,
            kind=kind,
            logger=self._logger,
        )
        yield make_meta(meta)

        runtime = self._build_runtime(ragflow_config=ragflow_config)
        cfg = runtime.cfg
        safety_filter = runtime.safety_filter
        safety_block_msg = runtime.safety_block_msg

        blocked_input = yield from self._maybe_block_input(
            request_id=request_id,
            question=question_raw,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
        )
        if blocked_input:
            return

        cache_enabled = runtime.cache_enabled
        cache_ttl_s = runtime.cache_ttl_s

        audio_cache_outcome = None
        if not str(inp.recording_id or "").strip():
            audio_cache_outcome = yield from _maybe_stream_audio_cache_shortcut(
                request_id=request_id,
                question=question,
                qa_audio_matcher=self._qa_audio_matcher,
                qa_audio_cache_enabled=runtime.qa_audio_cache_enabled,
                qa_audio_recall_top_k=runtime.qa_audio_recall_top_k,
                qa_audio_classifier_threshold=runtime.qa_audio_classifier_threshold,
                qa_audio_classifier_chat_name=runtime.qa_audio_classifier_chat_name,
                tts_provider=str(inp.tts_provider or ""),
                tts_voice=str(inp.tts_voice or ""),
                tts_speed=float(inp.tts_speed if inp.tts_speed is not None else 1.0),
                safety_filter=safety_filter,
                logger=self._logger,
                base_url="",
            )
        if audio_cache_outcome is not None:
            self._finalize_for_request(
                inp=inp,
                outcome=audio_cache_outcome,
                question=question,
                agent_id=agent_id,
                conversation_name=conversation_name,
                cache_enabled=cache_enabled,
                kb_version=runtime.kb_version,
                cache_ttl_s=cache_ttl_s,
                app_config=cfg.raw,
                qa_audio_cache_enabled=runtime.qa_audio_cache_enabled,
            )
            return

        cache_outcome = yield from _maybe_stream_cache_shortcut(
            request_id=request_id,
            question=question,
            kb_version=runtime.kb_version,
            cache_enabled=cache_enabled,
            safety_filter=safety_filter,
            history_store=self._history_store,
            logger=self._logger,
        )
        if cache_outcome is not None:
            self._finalize_for_request(
                inp=inp,
                outcome=cache_outcome,
                question=question,
                agent_id=agent_id,
                conversation_name=conversation_name,
                cache_enabled=cache_enabled,
                kb_version=runtime.kb_version,
                cache_ttl_s=cache_ttl_s,
                app_config=cfg.raw,
                qa_audio_cache_enabled=runtime.qa_audio_cache_enabled,
            )
            return

        question_for_rag, apply_qa_constraints, qa_no_self_intro, qa_max_answer_chars = self._build_qa_inputs(
            cfg=cfg,
            question=question_raw,
            guide=guide,
        )
        text_cleaning_cfg = cfg.text_cleaning

        fast_outcome = yield from _maybe_stream_fast_intent_shortcut(
            request_id=request_id,
            intent=intent,
            apply_qa_constraints=apply_qa_constraints,
            qa_max_answer_chars=qa_max_answer_chars,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
            logger=self._logger,
        )
        if fast_outcome is not None:
            self._finalize_for_request(
                inp=inp,
                outcome=fast_outcome,
                question=question,
                agent_id=agent_id,
                conversation_name=conversation_name,
                cache_enabled=cache_enabled,
                kb_version=runtime.kb_version,
                cache_ttl_s=cache_ttl_s,
                app_config=cfg.raw,
                qa_audio_cache_enabled=runtime.qa_audio_cache_enabled,
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
        stream_outcome = yield from self._stream_with_session(
            request_id=request_id,
            client_id=client_id,
            question=question_raw,
            agent_id=agent_id,
            question_for_rag=question_for_rag,
            rag_session=rag_session,
            cancel_event=cancel_event,
            t_submit=t_submit,
            settings=settings,
            apply_qa_constraints=apply_qa_constraints,
            qa_max_answer_chars=qa_max_answer_chars,
            safety_filter=safety_filter,
            safety_block_msg=safety_block_msg,
        )
        self._finalize_for_request(
            inp=inp,
            outcome=stream_outcome,
            question=question,
            agent_id=agent_id,
            conversation_name=conversation_name,
            cache_enabled=cache_enabled,
            kb_version=runtime.kb_version,
            cache_ttl_s=cache_ttl_s,
            app_config=cfg.raw,
            qa_audio_cache_enabled=runtime.qa_audio_cache_enabled,
        )
        return
