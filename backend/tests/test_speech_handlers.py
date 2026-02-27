from __future__ import annotations

from dataclasses import dataclass

from backend.api.speech_handlers import (
    build_ask_input,
    build_orchestrator,
    emit_ask_received_event,
    resolve_conversation_name,
    stream_sse_response,
)


@dataclass
class _Parsed:
    question: str = "hello"
    agent_id: str = ""
    conversation_name: str = "chat1"
    guide: dict = None
    client_id: str = "c1"
    kind: str = "ask"
    save_history: bool = True
    request_id: str = "r1"
    recording_id: str | None = None
    tts_provider: str | None = "modelscope"
    tts_voice: str | None = "voice-1"
    tts_speed: float | None = 1.25
    qa_answer_target_chars: int | None = 180
    qa_audio_cache_confidence_threshold: float | None = 0.9
    qa_audio_cache_lookup_enabled: bool | None = False
    stop_name: str | None = "A"
    stop_index: int | None = 1
    tour_action: str | None = "next"
    action_type: str = "x"


class _Events:
    def __init__(self):
        self.items: list[dict] = []

    def emit(self, **kwargs):
        self.items.append(dict(kwargs))


class _Logger:
    def __init__(self):
        self.infos: list[str] = []

    def info(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.infos.append(str(msg))


class _Deps:
    def __init__(self):
        self.event_store = _Events()
        self.logger = _Logger()


class _Orchestrator:
    def stream_ask(self, **kwargs):  # noqa: ANN003
        yield {"chunk": "a", "done": False}
        yield {"chunk": "b", "done": True}


class _AskTimings:
    @staticmethod
    def set(*args, **kwargs):  # noqa: ANN002, ANN003
        return None

    @staticmethod
    def get(*args, **kwargs):  # noqa: ANN002, ANN003
        return None


def test_emit_ask_received_event_contains_stop_id():
    deps = _Deps()
    p = _Parsed(guide={})
    emit_ask_received_event(deps=deps, parsed=p)
    evt = deps.event_store.items[-1]
    assert evt["name"] == "ask_received"
    assert evt["stop_id"] == "stop_1"
    assert evt["chat_name"] == "chat1"


def test_resolve_conversation_name_clears_when_agent_mode():
    deps = _Deps()
    p = _Parsed(agent_id="a1", conversation_name="chatX", guide={})
    got = resolve_conversation_name(deps=deps, parsed=p)
    assert got == ""


def test_build_ask_input_uses_resolved_conversation_name():
    p = _Parsed(guide={})
    inp = build_ask_input(parsed=p, conversation_name="x")
    assert inp.conversation_name == "x"
    assert inp.request_id == "r1"
    assert inp.recording_id is None
    assert inp.tts_provider == "modelscope"
    assert inp.tts_voice == "voice-1"
    assert abs(float(inp.tts_speed) - 1.25) < 1e-6
    assert inp.qa_answer_target_chars == 180
    assert abs(float(inp.qa_audio_cache_confidence_threshold) - 0.9) < 1e-6
    assert inp.qa_audio_cache_lookup_enabled is False


def test_stream_sse_response_encodes_payload_lines():
    out = list(
        stream_sse_response(
            orchestrator=_Orchestrator(),
            inp=build_ask_input(parsed=_Parsed(guide={}), conversation_name="chat1"),
            ragflow_config={},
            cancel_event=None,
            request_id="r1",
            t_submit=0.0,
            payload_stream_builder=lambda raw: raw,
        )
    )
    assert len(out) == 2
    assert out[0].startswith("data: ")
    assert '"request_id": "r1"' in out[0]


def test_build_orchestrator_passes_qa_audio_matcher():
    deps = _Deps()
    deps.ragflow_service = object()
    deps.ragflow_agent_service = object()
    deps.intent_service = object()
    deps.history_store = object()
    deps.selling_points_store = object()
    deps.ask_timings = _AskTimings()
    deps.session = object()
    deps.qa_audio_matcher = object()

    orchestrator = build_orchestrator(deps=deps)
    assert getattr(orchestrator, "_qa_audio_matcher", None) is deps.qa_audio_matcher
