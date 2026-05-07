from __future__ import annotations

from dataclasses import dataclass

from flask import Flask

import backend.api.speech as speech_module
from backend.api.speech import create_blueprint


class _RagflowService:
    def __init__(self):
        self.calls: list[dict] = []

    def ask_chat(self, **kwargs):  # noqa: ANN003
        self.calls.append(dict(kwargs))
        return '{"text":"纠错文本"}'


class _Logger:
    def __init__(self):
        self.infos: list[str] = []
        self.warnings: list[str] = []
        self.errors: list[str] = []

    def info(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.infos.append(str(msg))

    def warning(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.warnings.append(str(msg))

    def error(self, msg: str, *a, **k):  # noqa: ANN001, ANN003
        self.errors.append(str(msg))


class _EventStore:
    def __init__(self):
        self.items: list[dict] = []

    def emit(self, **kwargs):  # noqa: ANN003
        self.items.append(dict(kwargs))


class _AskTimings:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def set(self, request_id: str, **kwargs):  # noqa: ANN003
        self.calls.append((str(request_id), dict(kwargs)))

    def get(self, request_id: str):  # noqa: ARG002
        return {}


class _RequestRegistry:
    def __init__(self, *, rate_allow: bool = True):
        self.rate_allow_value = bool(rate_allow)
        self.cancel_calls: list[tuple[str, str]] = []
        self.cancel_active_calls: list[tuple[str, str, str]] = []
        self.register_calls: list[tuple] = []

    def rate_allow(self, client_id: str, kind: str, *, limit: int, window_s: float):  # noqa: ARG002
        return bool(self.rate_allow_value)

    def cancel(self, request_id: str, *, reason: str):
        self.cancel_calls.append((str(request_id), str(reason)))
        return True

    def cancel_active(self, *, client_id: str, kind: str, reason: str):
        self.cancel_active_calls.append((str(client_id), str(kind), str(reason)))
        return "active_req_1"

    def register(self, *, client_id: str, request_id: str, kind: str, cancel_previous: bool = True):  # noqa: ARG002
        self.register_calls.append((str(client_id), str(request_id), str(kind), bool(cancel_previous)))

        class _CancelEvent:
            @staticmethod
            def is_set():
                return False

        return _CancelEvent()

    def clear_active(self, *, client_id: str, kind: str, request_id: str):  # noqa: ARG002
        return None

    def get_info(self, request_id: str):  # noqa: ARG002
        return {}

    def is_cancelled(self, request_id: str):  # noqa: ARG002
        return False


@dataclass
class _Parsed:
    request_id: str = "ask_fixed_1"
    client_id: str = "client_1"
    kind: str = "ask"
    agent_id: str = ""
    guide: dict | None = None
    conversation_name: str = "chat-default"
    question: str = "hello"
    action_type: str = "问答"
    stop_name: str | None = None
    stop_index: int | None = None
    tour_action: str | None = None
    recording_id: str | None = None
    tts_provider: str | None = None
    tts_voice: str | None = None
    tts_speed: float | None = None
    qa_answer_target_chars: int | None = None
    qa_audio_cache_confidence_threshold: float | None = None
    qa_audio_cache_lookup_enabled: bool | None = None
    save_history: bool = True


class _Deps:
    def __init__(self, *, rate_allow: bool = True):
        self.ragflow_service = _RagflowService()
        self.ragflow_chat_manager = self.ragflow_service
        self.logger = _Logger()
        self.request_registry = _RequestRegistry(rate_allow=rate_allow)
        self.event_store = _EventStore()
        self.ask_timings = _AskTimings()
        self.ragflow_default_chat_name = "chat-default"


class _DepsMissingAsrFilterManager(_Deps):
    def __init__(self):
        super().__init__()
        del self.ragflow_chat_manager


def _app(deps: _Deps) -> Flask:
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app


def test_asr_filter_text_required_and_prompt_required():
    deps = _Deps()
    client = _app(deps).test_client()

    bad = client.post("/api/asr/filter", json={"prompt": "x"})
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "text_required"

    prompt_empty = client.post("/api/asr/filter", json={"text": "原始文本", "prompt": ""})
    assert prompt_empty.status_code == 400
    body = prompt_empty.get_json()
    assert body["ok"] is False
    assert body["error"] == "prompt_required"
    assert deps.ragflow_service.calls == []


def test_asr_filter_fails_fast_when_chat_manager_missing():
    deps = _DepsMissingAsrFilterManager()
    client = _app(deps).test_client()

    resp = client.post("/api/asr/filter", json={"text": "hello", "prompt": "fix {ASR_TEXT}"})

    assert resp.status_code == 500
    body = resp.get_json()
    assert body["ok"] is False
    assert body["error"] == "asr_filter_dependency_missing"
    assert body["dependency"] == "ragflow_chat_manager"
    assert deps.ragflow_service.calls == []


def test_sauc_proxy_health_reports_registration_and_history_tail():
    deps = _Deps()
    app = _app(deps)
    app.config["RAGINT_SAUC_PROXY_REGISTERED"] = True
    app.config["RAGINT_SAUC_LAST_EVENT"] = {"stage": "ready", "request_id": "r1"}
    app.config["RAGINT_SAUC_EVENT_HISTORY"] = [{"stage": f"s{i}", "request_id": f"r{i}"} for i in range(15)]

    client = app.test_client()
    resp = client.get("/api/asr/sauc/health")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    sp = body["sauc_proxy"]
    assert sp["registered"] is True
    assert sp["last_event"]["stage"] == "ready"
    assert len(sp["event_history"]) == 10
    assert sp["event_history"][-1]["stage"] == "s14"
    assert isinstance(sp["receive_timeout_supported"], bool)


def test_sauc_proxy_health_fails_when_dependency_introspection_errors(monkeypatch):
    deps = _Deps()
    client = _app(deps).test_client()
    original_find_spec = speech_module.importlib.util.find_spec
    original_import_module = speech_module.importlib.import_module

    def fake_find_spec(name: str):
        if name == "simple_websocket":
            return object()
        if name in {"aiohttp", "flask_sock"}:
            return None
        return original_find_spec(name)

    def fake_import_module(name: str):
        if name == "simple_websocket":
            raise RuntimeError("broken dependency")
        return original_import_module(name)

    monkeypatch.setattr(speech_module.importlib.util, "find_spec", fake_find_spec)
    monkeypatch.setattr(speech_module.importlib, "import_module", fake_import_module)

    resp = client.get("/api/asr/sauc/health")

    assert resp.status_code == 500
    body = resp.get_json()
    assert body["ok"] is False
    assert body["error"] == "sauc_dependency_inspection_failed"
    assert body["dependency"] == "simple_websocket"
    assert "broken dependency" in body["detail"]


def test_cancel_endpoint_covers_request_id_and_active_fallback():
    deps = _Deps()
    client = _app(deps).test_client()

    by_id = client.post("/api/cancel", json={"request_id": "r123", "reason": "manual"})
    assert by_id.status_code == 200
    body1 = by_id.get_json()
    assert body1["cancelled"] is True
    assert body1["request_id"] == "r123"
    assert deps.request_registry.cancel_calls[-1] == ("r123", "manual")

    active = client.post("/api/cancel", headers={"X-Client-ID": "cid1"}, json={})
    assert active.status_code == 200
    body2 = active.get_json()
    assert body2["cancelled"] is True
    assert body2["request_id"] == "active_req_1"
    assert deps.request_registry.cancel_active_calls[-1] == ("cid1", "ask", "client_cancel")


def test_ask_rate_limited_returns_sse_without_registering():
    deps = _Deps(rate_allow=False)
    client = _app(deps).test_client()

    resp = client.post("/api/ask", json={"question": "hello"})
    assert resp.status_code == 200
    assert "text/event-stream" in str(resp.headers.get("content-type", "")).lower()
    payload = resp.data.decode("utf-8")
    assert "data: " in payload
    assert '"done":true' in payload.replace(" ", "")
    names = [str(it.get("name") or "") for it in deps.event_store.items]
    assert "ask_rate_limited" in names
    assert deps.request_registry.register_calls == []


def test_ask_success_path_streams_sse(monkeypatch):
    deps = _Deps(rate_allow=True)
    client = _app(deps).test_client()
    parsed = _Parsed()

    monkeypatch.setattr(speech_module, "parse_ask_request", lambda deps, data: (parsed, None))
    monkeypatch.setattr(speech_module, "emit_ask_received_event", lambda deps, parsed: None)
    monkeypatch.setattr(speech_module, "run_request_middlewares", lambda ctx, middlewares: None)
    monkeypatch.setattr(speech_module, "resolve_conversation_name", lambda deps, parsed: "chat-x")
    monkeypatch.setattr(speech_module, "build_orchestrator", lambda deps: object())
    monkeypatch.setattr(speech_module, "get_ragflow_config", lambda deps: {"x": 1})
    monkeypatch.setattr(speech_module, "build_ask_input", lambda parsed, conversation_name: {"ok": True, "chat": conversation_name})
    monkeypatch.setattr(
        speech_module,
        "stream_sse_response",
        lambda **kwargs: iter(["data: {\"chunk\":\"ok\",\"done\":true}\n\n"]),
    )

    resp = client.post("/api/ask", json={"question": "hello"})
    assert resp.status_code == 200
    assert "text/event-stream" in str(resp.headers.get("content-type", "")).lower()
    assert resp.headers.get("Cache-Control") == "no-cache"
    assert resp.headers.get("X-Accel-Buffering") == "no"
    assert '"chunk":"ok"' in resp.data.decode("utf-8").replace(" ", "")
    assert deps.ask_timings.calls
    assert all(call[0] == "ask_fixed_1" for call in deps.ask_timings.calls)
    merged_timing = {}
    for _, fields in deps.ask_timings.calls:
        merged_timing.update(fields)
    assert "t_submit" in merged_timing
    assert "t_server_receive_wall_ms" in merged_timing
    assert "t_submit_wall_ms" in merged_timing
    assert "t_request_parse_done_wall_ms" in merged_timing
    assert "t_conversation_resolved_wall_ms" in merged_timing
    assert "t_orchestrator_ready_wall_ms" in merged_timing
