from __future__ import annotations

import pytest

from backend.orchestrators.conversation_orchestrator import AskInput, ConversationOrchestrator
from backend.orchestrators.ragflow_streaming import AskStreamOutcome, RagflowStreamSettings


class _Logger:
    def __init__(self):
        self.warns: list[str] = []
        self.errors: list[str] = []

    def warning(self, msg: str) -> None:
        self.warns.append(str(msg))

    def error(self, msg: str, exc_info: bool = False) -> None:  # noqa: ARG002
        self.errors.append(str(msg))


class _Safety:
    def __init__(self, enabled: bool, term: str | None):
        self.enabled = bool(enabled)
        self._term = term

    def match_text(self, _text: str):
        return self._term


class _Cancel:
    def __init__(self, is_set: bool = False):
        self._is_set = bool(is_set)

    def is_set(self) -> bool:
        return bool(self._is_set)


def _drain(gen):
    items = []
    try:
        while True:
            items.append(next(gen))
    except StopIteration as e:
        return items, e.value


def _mk_orchestrator(logger):
    return ConversationOrchestrator(
        ragflow_service=object(),
        ragflow_agent_service=object(),
        intent_service=object(),
        history_store=object(),
        logger=logger,
        timings_set=lambda *_a, **_k: None,
        timings_get=lambda *_a, **_k: {},
        default_session=None,
    )


def _settings():
    return RagflowStreamSettings(
        apply_qa_constraints=False,
        qa_no_self_intro=False,
        qa_max_answer_chars=0,
        safety_filter=_Safety(False, None),
        safety_block_msg="blocked",
        enable_cleaning=False,
        text_cleaner=None,
        tts_buffer=None,
        start_tts_on_first_chunk=False,
        first_segment_min_chars=1,
        segment_flush_interval_s=0.8,
        segment_min_chars=3,
    )


def test_maybe_block_input_emits_block_payload_and_returns_true():
    logger = _Logger()
    orch = _mk_orchestrator(logger)

    gen = orch._maybe_block_input(
        request_id="r1",
        question="敏感词",
        safety_filter=_Safety(True, "敏感词"),
        safety_block_msg="抱歉，无法回答",
    )
    yielded, blocked = _drain(gen)

    assert blocked is True
    assert yielded[0]["done"] is False
    assert yielded[0]["chunk"] == "抱歉，无法回答"
    assert yielded[1]["done"] is True
    assert logger.warns and "safety_block_input" in logger.warns[0]


def test_maybe_block_input_returns_false_when_not_matched():
    logger = _Logger()
    orch = _mk_orchestrator(logger)

    gen = orch._maybe_block_input(
        request_id="r1",
        question="普通问题",
        safety_filter=_Safety(True, None),
        safety_block_msg="抱歉，无法回答",
    )
    yielded, blocked = _drain(gen)

    assert yielded == []
    assert blocked is False
    assert logger.warns == []


def test_stream_with_session_fails_fast_when_chat_session_missing():
    logger = _Logger()
    orch = _mk_orchestrator(logger)

    gen = orch._stream_with_session(
        request_id="r1",
        client_id="c1",
        agent_id="",
        question_for_rag="普通问题",
        rag_session=None,
        cancel_event=_Cancel(False),
        t_submit=0.0,
        settings=_settings(),
    )
    yielded, outcome = _drain(gen)

    assert yielded[0]["chunk"] == "RAGFlow 会话不可用，已停止当前请求。"
    assert yielded[0]["error"]["code"] == "ragflow_session_required"
    assert yielded[-1]["done"] is True
    assert yielded[-1]["error"]["code"] == "ragflow_session_required"
    assert outcome.answer == ""
    assert outcome.done_sent is True
    assert outcome.save_allowed is False
    assert outcome.cache_put_allowed is False


def test_finalize_fails_fast_when_history_save_fails():
    class _FailingHistoryStore:
        def add_entry(self, **_kwargs):  # noqa: ANN003
            raise RuntimeError("history_write_failed")

    logger = _Logger()
    orch = ConversationOrchestrator(
        ragflow_service=object(),
        ragflow_agent_service=object(),
        intent_service=object(),
        history_store=_FailingHistoryStore(),
        logger=logger,
        timings_set=lambda *_a, **_k: None,
        timings_get=lambda *_a, **_k: {},
        default_session=None,
    )

    # Given an answer has been produced and history saving is required
    # When the history store rejects the save
    # Then the request fails visibly instead of reporting a successful ask
    with pytest.raises(RuntimeError, match="history_write_failed"):
        orch._finalize_for_request(
            inp=AskInput(question="q", request_id="r1", client_id="c1", kind="ask", save_history=True),
            outcome=AskStreamOutcome(answer="a", cache_put_allowed=True),
            question="q",
            agent_id="",
            conversation_name="chat",
            cache_enabled=False,
            kb_version="kb1",
            cache_ttl_s=60,
            app_config={},
            qa_audio_cache_enabled=False,
        )
    assert logger.errors == ["[r1] ask_finalize_failed"]


def test_finalize_fails_fast_when_cache_put_fails():
    class _FailingCacheHistoryStore:
        def add_entry(self, **_kwargs):  # noqa: ANN003
            return None

        def cache_put(self, **_kwargs):  # noqa: ANN003
            raise RuntimeError("qa_text_cache_write_failed")

    logger = _Logger()
    orch = ConversationOrchestrator(
        ragflow_service=object(),
        ragflow_agent_service=object(),
        intent_service=object(),
        history_store=_FailingCacheHistoryStore(),
        logger=logger,
        timings_set=lambda *_a, **_k: None,
        timings_get=lambda *_a, **_k: {},
        default_session=None,
    )

    # Given a cacheable answer has been produced
    # When writing the answer cache fails
    # Then the persistence failure is visible to the caller
    with pytest.raises(RuntimeError, match="qa_text_cache_write_failed"):
        orch._finalize_for_request(
            inp=AskInput(question="q", request_id="r2", client_id="c1", kind="ask", save_history=True),
            outcome=AskStreamOutcome(answer="a", cache_put_allowed=True),
            question="q",
            agent_id="",
            conversation_name="chat",
            cache_enabled=True,
            kb_version="kb1",
            cache_ttl_s=60,
            app_config={},
            qa_audio_cache_enabled=False,
        )
    assert logger.errors == ["[r2] ask_finalize_failed"]


def test_finalize_fails_fast_when_qa_audio_upsert_scheduling_fails():
    class _HistoryStore:
        def add_entry(self, **_kwargs):  # noqa: ANN003
            return None

    class _FailingQaAudioMatcher:
        def schedule_upsert_from_answer(self, **_kwargs):  # noqa: ANN003
            raise RuntimeError("qa_audio_upsert_schedule_failed")

    logger = _Logger()
    orch = ConversationOrchestrator(
        ragflow_service=object(),
        ragflow_agent_service=object(),
        intent_service=object(),
        history_store=_HistoryStore(),
        qa_audio_matcher=_FailingQaAudioMatcher(),
        logger=logger,
        timings_set=lambda *_a, **_k: None,
        timings_get=lambda *_a, **_k: {},
        default_session=None,
    )

    # Given a QA-audio-indexable answer has been produced
    # When scheduling audio upsert fails
    # Then the request exposes the failed persistence side effect
    with pytest.raises(RuntimeError, match="qa_audio_upsert_schedule_failed"):
        orch._finalize_for_request(
            inp=AskInput(
                question="q",
                request_id="r3",
                client_id="c1",
                kind="ask",
                save_history=True,
                tts_provider="edge",
                tts_voice="voice",
                tts_speed=1.0,
            ),
            outcome=AskStreamOutcome(answer="a", cache_put_allowed=True),
            question="q",
            agent_id="",
            conversation_name="chat",
            cache_enabled=False,
            kb_version="kb1",
            cache_ttl_s=60,
            app_config={},
            qa_audio_cache_enabled=True,
        )
    assert logger.errors == ["[r3] ask_finalize_failed"]
