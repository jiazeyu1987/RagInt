from __future__ import annotations

import logging
import threading

from backend.orchestrators.conversation_orchestrator import AskInput, ConversationOrchestrator
from backend.orchestrators.question_prompting import apply_explanation_script_requirements, extract_base_question


class _Intent:
    def __init__(self, intent: str = "qa", confidence: float = 0.95):
        self.intent = intent
        self.confidence = confidence
        self.matched = []
        self.reason = ""


class _IntentService:
    def classify(self, question: str):  # noqa: ARG002
        return _Intent(intent="qa", confidence=0.95)


class _Chunk:
    def __init__(self, content: str):
        self.content = content


class _Session:
    def ask(self, question: str, stream: bool = True):  # noqa: ARG002
        if stream:
            return [_Chunk("心脏介入展厅主要展示相关器械。")]
        return "心脏介入展厅主要展示相关器械。"


class _RagflowService:
    def get_session(self, conversation_name: str):  # noqa: ARG002
        return _Session()


class _RagflowAgentService:
    def stream_completion_text(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return []


class _HistoryStore:
    def __init__(self):
        self.entries = []
        self.cache = {}

    def add_entry(self, **kwargs):
        self.entries.append(dict(kwargs))

    def cache_get(self, *, question: str, kb_version: str):
        return self.cache.get((question, kb_version))

    def cache_put(self, *, question: str, answer: str, kb_version: str, ttl_s: float):  # noqa: ARG002
        self.cache[(question, kb_version)] = answer


class _QaAudioMatcher:
    def __init__(self):
        self.upserts = []
        self.find_calls = []

    def find_match(self, **kwargs):  # noqa: ANN003
        self.find_calls.append(dict(kwargs))
        return None

    def schedule_upsert_from_answer(self, **kwargs):  # noqa: ANN003
        self.upserts.append(dict(kwargs))


def _timings_set(request_id: str, **kwargs):  # noqa: ARG001
    return None


def _timings_get(request_id: str):  # noqa: ARG001
    return {}


def test_extract_base_question_strips_instruction_blocks():
    raw = (
        "请介绍心脏介入展厅\n\n"
        "【本站讲解时长】约15秒\n"
        "【人群画像】大众\n"
        "- 不要预告下一站"
    )
    assert extract_base_question(raw) == "请介绍心脏介入展厅"


def test_apply_explanation_script_requirements_keeps_question_plain():
    q = "请介绍展厅"
    out1 = apply_explanation_script_requirements(q, enabled=True, answer_target_chars=220)
    out2 = apply_explanation_script_requirements(out1, enabled=True)
    assert out1 == q
    assert out1 == out2


def test_apply_explanation_script_requirements_ignores_answer_target_chars():
    out = apply_explanation_script_requirements("请回答", enabled=True, answer_target_chars=10)
    assert out == "请回答"


def test_apply_explanation_script_requirements_ignores_audience_profile():
    out = apply_explanation_script_requirements(
        "请回答",
        enabled=True,
        answer_target_chars=10,
        audience_profile="儿童",
    )
    assert out == "请回答"


def test_apply_explanation_script_requirements_strips_existing_constraint_block():
    src = (
        "请介绍展厅\n\n"
        "【口播讲解稿约束】\n"
        "请用可直接播报的讲解稿风格回复，语言自然连贯。\n"
        "回答长度控制：约20字。\n"
    )
    out = apply_explanation_script_requirements(src, enabled=True, answer_target_chars=1)
    assert out == "请介绍展厅"


def test_apply_explanation_script_requirements_strips_existing_new_constraint_block():
    src = (
        "请介绍展厅\n\n"
        "【口播讲解约束】\n"
        "请用可直接播报的讲解稿风格回复，语言自然连贯。\n"
        "仅输出正文，不要标题、列表、分点、序号。\n"
    )
    out = apply_explanation_script_requirements(src, enabled=True, answer_target_chars=1, audience_profile="专业")
    assert out == "请介绍展厅"


def test_stream_ask_upserts_qa_audio_with_base_question_only():
    history = _HistoryStore()
    matcher = _QaAudioMatcher()
    orch = ConversationOrchestrator(
        ragflow_service=_RagflowService(),
        ragflow_agent_service=_RagflowAgentService(),
        intent_service=_IntentService(),
        history_store=history,
        selling_points_store=None,
        logger=logging.getLogger("test"),
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=_Session(),
        qa_audio_matcher=matcher,
    )

    raw_question = (
        "请介绍心脏介入展厅\n\n"
        "【本站讲解时长】约15秒\n"
        "【人群画像】大众"
    )

    inp = AskInput(
        question=raw_question,
        request_id="ask_t1",
        client_id="c1",
        kind="ask",
        conversation_name="展厅聊天",
        save_history=True,
        tts_provider="edge",
        tts_voice="zh-CN-XiaoxiaoNeural",
        tts_speed=1.0,
    )
    cfg = {
        "kb_version": "kb1",
        "qa_cache": {"enabled": True, "ttl_s": 60},
        "qa_audio_cache": {"enabled": True, "recall_top_k": 10, "classifier_threshold": 0.8},
        "text_cleaning": {"enabled": False},
    }

    list(orch.stream_ask(inp=inp, ragflow_config=cfg, cancel_event=threading.Event(), t_submit=0.0))

    assert matcher.upserts, "qa audio upsert should be scheduled"
    assert matcher.upserts[0]["question"] == "请介绍心脏介入展厅"


def test_stream_ask_disables_audio_cache_lookup_but_still_upserts():
    history = _HistoryStore()
    matcher = _QaAudioMatcher()
    orch = ConversationOrchestrator(
        ragflow_service=_RagflowService(),
        ragflow_agent_service=_RagflowAgentService(),
        intent_service=_IntentService(),
        history_store=history,
        selling_points_store=None,
        logger=logging.getLogger("test"),
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=_Session(),
        qa_audio_matcher=matcher,
    )

    inp = AskInput(
        question="请介绍心脏介入展厅",
        request_id="ask_t1_disabled_lookup",
        client_id="c1",
        kind="ask",
        conversation_name="展厅聊天",
        save_history=True,
        tts_provider="edge",
        tts_voice="zh-CN-XiaoxiaoNeural",
        tts_speed=1.0,
        qa_audio_cache_lookup_enabled=False,
    )
    cfg = {
        "kb_version": "kb1",
        "qa_cache": {"enabled": True, "ttl_s": 60},
        "qa_audio_cache": {"enabled": True, "recall_top_k": 10, "classifier_threshold": 0.8},
        "text_cleaning": {"enabled": False},
    }

    list(orch.stream_ask(inp=inp, ragflow_config=cfg, cancel_event=threading.Event(), t_submit=0.0))

    assert matcher.find_calls == []
    assert matcher.upserts, "qa audio upsert should still be scheduled when lookup is disabled"


def test_stream_ask_does_not_append_script_constraints():
    class _CaptureSession:
        def __init__(self):
            self.last_question = ""

        def ask(self, question: str, stream: bool = True):  # noqa: ARG002
            self.last_question = str(question or "")
            if stream:
                return [_Chunk("好的。")]
            return "好的。"

    class _CaptureRagflowService:
        def __init__(self):
            self.session = _CaptureSession()

        def get_session(self, conversation_name: str):  # noqa: ARG002
            return self.session

    ragflow = _CaptureRagflowService()
    orch = ConversationOrchestrator(
        ragflow_service=ragflow,
        ragflow_agent_service=_RagflowAgentService(),
        intent_service=_IntentService(),
        history_store=_HistoryStore(),
        selling_points_store=None,
        logger=logging.getLogger("test"),
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=ragflow.session,
        qa_audio_matcher=None,
    )

    inp = AskInput(
        question="请介绍心脏介入展厅",
        request_id="ask_t2",
        client_id="c1",
        kind="ask",
        conversation_name="展厅聊天",
        save_history=False,
        guide={"enabled": False, "audience_profile": "儿童"},
        qa_answer_target_chars=10,
    )
    cfg = {"kb_version": "kb1", "qa_cache": {"enabled": False}, "text_cleaning": {"enabled": False}}

    list(orch.stream_ask(inp=inp, ragflow_config=cfg, cancel_event=threading.Event(), t_submit=0.0))
    assert "【口播讲解约束】" not in ragflow.session.last_question
    assert "风格参考受众画像：儿童" not in ragflow.session.last_question
    assert "回答长度控制" not in ragflow.session.last_question

class _QaAudioMatcherDebugNoHit:
    def __init__(self, debug_payload: dict):
        self._debug_payload = dict(debug_payload or {})
        self.find_calls = []

    def find_match(self, **kwargs):  # noqa: ANN003
        self.find_calls.append(dict(kwargs))
        return None

    def get_last_debug(self):
        return dict(self._debug_payload)

    def schedule_upsert_from_answer(self, **kwargs):  # noqa: ANN003
        return None


def _collect_stage_meta(items: list[dict]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for item in items:
        meta = item.get("meta") if isinstance(item, dict) else None
        if not isinstance(meta, dict):
            continue
        stage = str(meta.get("ragflow_chat_stage") or "").strip()
        active = str(meta.get("ragflow_chat_active") or "").strip()
        if stage:
            out.append((stage, active))
    return out


def test_stream_ask_emits_runtime_ragflow_chat_meta_for_qa_match_and_main_ask():
    matcher = _QaAudioMatcherDebugNoHit(
        {
            "hit": False,
            "reason": "classifier_no_match:test",
            "classifier_called": True,
            "classifier_chat_name": "问题比对",
        }
    )
    orch = ConversationOrchestrator(
        ragflow_service=_RagflowService(),
        ragflow_agent_service=_RagflowAgentService(),
        intent_service=_IntentService(),
        history_store=_HistoryStore(),
        selling_points_store=None,
        logger=logging.getLogger("test"),
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=_Session(),
        qa_audio_matcher=matcher,
    )

    inp = AskInput(
        question="test question",
        request_id="ask_meta_1",
        client_id="c1",
        kind="ask",
        conversation_name="展厅聊天",
        save_history=False,
    )
    cfg = {
        "kb_version": "kb1",
        "qa_cache": {"enabled": False},
        "qa_audio_cache": {"enabled": True, "recall_top_k": 10, "classifier_threshold": 0.8},
        "text_cleaning": {"enabled": False},
    }

    items = list(orch.stream_ask(inp=inp, ragflow_config=cfg, cancel_event=threading.Event(), t_submit=0.0))
    stages = _collect_stage_meta(items)

    assert ("qa_match", "问题比对") in stages
    assert ("main_ask", "展厅聊天") in stages
    qa_idx = stages.index(("qa_match", "问题比对"))
    main_idx = stages.index(("main_ask", "展厅聊天"))
    assert qa_idx < main_idx


def test_stream_ask_skips_qa_match_meta_when_classifier_not_called():
    matcher = _QaAudioMatcherDebugNoHit(
        {
            "hit": False,
            "reason": "heuristic_match_without_classifier",
            "classifier_called": False,
            "classifier_chat_name": "问题比对",
        }
    )
    orch = ConversationOrchestrator(
        ragflow_service=_RagflowService(),
        ragflow_agent_service=_RagflowAgentService(),
        intent_service=_IntentService(),
        history_store=_HistoryStore(),
        selling_points_store=None,
        logger=logging.getLogger("test"),
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=_Session(),
        qa_audio_matcher=matcher,
    )

    inp = AskInput(
        question="test question",
        request_id="ask_meta_2",
        client_id="c1",
        kind="ask",
        conversation_name="展厅聊天",
        save_history=False,
    )
    cfg = {
        "kb_version": "kb1",
        "qa_cache": {"enabled": False},
        "qa_audio_cache": {"enabled": True, "recall_top_k": 10, "classifier_threshold": 0.8},
        "text_cleaning": {"enabled": False},
    }

    items = list(orch.stream_ask(inp=inp, ragflow_config=cfg, cancel_event=threading.Event(), t_submit=0.0))
    stages = _collect_stage_meta(items)

    assert ("main_ask", "展厅聊天") in stages
    assert all(stage != "qa_match" for stage, _active in stages)


def _collect_trace_meta(items: list[dict]) -> list[dict]:
    out: list[dict] = []
    for item in items:
        meta = item.get("meta") if isinstance(item, dict) else None
        if not isinstance(meta, dict):
            continue
        source = str(meta.get("answer_source") or "").strip()
        reason = str(meta.get("trace_reason") or "").strip()
        mode = str(meta.get("request_mode") or "").strip()
        if source or reason or mode:
            out.append({"answer_source": source, "trace_reason": reason, "request_mode": mode, "raw": dict(meta)})
    return out


def test_stream_ask_emits_trace_source_for_lookup_and_main_stream():
    matcher = _QaAudioMatcherDebugNoHit(
        {
            "hit": False,
            "reason": "classifier_no_match:test",
            "classifier_called": True,
            "classifier_chat_name": "\u95ee\u9898\u6bd4\u5bf9",
        }
    )
    orch = ConversationOrchestrator(
        ragflow_service=_RagflowService(),
        ragflow_agent_service=_RagflowAgentService(),
        intent_service=_IntentService(),
        history_store=_HistoryStore(),
        selling_points_store=None,
        logger=logging.getLogger("test"),
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=_Session(),
        qa_audio_matcher=matcher,
    )

    inp = AskInput(
        question="test question",
        request_id="ask_meta_trace_1",
        client_id="c1",
        kind="ask",
        conversation_name="\u5c55\u5385\u804a\u5929",
        save_history=False,
    )
    cfg = {
        "kb_version": "kb1",
        "qa_cache": {"enabled": False},
        "qa_audio_cache": {"enabled": True, "recall_top_k": 10, "classifier_threshold": 0.8},
        "text_cleaning": {"enabled": False},
    }

    items = list(orch.stream_ask(inp=inp, ragflow_config=cfg, cancel_event=threading.Event(), t_submit=0.0))
    traces = _collect_trace_meta(items)

    assert any(t.get("answer_source") == "qa_audio_cache_lookup" for t in traces)
    assert any(t.get("answer_source") == "ragflow_stream" for t in traces)
    assert any(t.get("request_mode") == "send" for t in traces)


def test_stream_ask_emits_fast_intent_trace_source():
    class _FastIntentService:
        def classify(self, question: str):  # noqa: ARG002
            return _Intent(intent="chitchat", confidence=0.99)

    orch = ConversationOrchestrator(
        ragflow_service=_RagflowService(),
        ragflow_agent_service=_RagflowAgentService(),
        intent_service=_FastIntentService(),
        history_store=_HistoryStore(),
        selling_points_store=None,
        logger=logging.getLogger("test"),
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=_Session(),
        qa_audio_matcher=None,
    )

    inp = AskInput(
        question="\u4f60\u597d",
        request_id="ask_meta_trace_2",
        client_id="c1",
        kind="ask",
        conversation_name="\u5c55\u5385\u804a\u5929",
        save_history=False,
    )
    cfg = {
        "kb_version": "kb1",
        "qa_cache": {"enabled": False},
        "qa_audio_cache": {"enabled": False},
        "text_cleaning": {"enabled": False},
    }

    items = list(orch.stream_ask(inp=inp, ragflow_config=cfg, cancel_event=threading.Event(), t_submit=0.0))
    traces = _collect_trace_meta(items)

    assert any(t.get("answer_source") == "fast_intent" for t in traces)
    assert any((t.get("trace_reason") or "").startswith("intent:") for t in traces)
