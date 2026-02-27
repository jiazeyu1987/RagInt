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


def test_apply_explanation_script_requirements_appends_constraints_once():
    q = "请介绍展厅"
    out1 = apply_explanation_script_requirements(q, enabled=True, answer_target_chars=220)
    out2 = apply_explanation_script_requirements(out1, enabled=True)
    assert "【口播讲解稿约束】" in out1
    assert "不要使用特殊符号" in out1
    assert "基础标点" in out1
    assert "220个文字左右" in out1
    assert out1 == out2


def test_apply_explanation_script_requirements_uses_chars_phrase():
    out = apply_explanation_script_requirements("请回答", enabled=True, answer_target_chars=10)
    assert "10个文字左右" in out


def test_apply_explanation_script_requirements_includes_audience_profile_style_hint():
    out = apply_explanation_script_requirements(
        "请回答",
        enabled=True,
        answer_target_chars=10,
        audience_profile="儿童",
    )
    assert "风格请参考人群画像：儿童" in out


def test_apply_explanation_script_requirements_rewrites_existing_old_length_line():
    src = (
        "请介绍展厅\n\n"
        "【口播讲解稿约束】\n"
        "请用可直接播报的讲解稿风格回复，语言自然连贯。\n"
        "回答长度控制：约20字。\n"
    )
    out = apply_explanation_script_requirements(src, enabled=True, answer_target_chars=1)
    assert "约20字" not in out
    assert "1个文字左右" in out


def test_apply_explanation_script_requirements_rewrites_existing_style_line():
    src = (
        "请介绍展厅\n\n"
        "【口播讲解稿约束】\n"
        "请用可直接播报的讲解稿风格回复，语言自然连贯。\n"
    )
    out = apply_explanation_script_requirements(src, enabled=True, answer_target_chars=1, audience_profile="专业")
    assert "风格请参考人群画像：专业" in out


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


def test_stream_ask_applies_audience_profile_to_script_prompt():
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
    assert "风格请参考人群画像：儿童" in ragflow.session.last_question
