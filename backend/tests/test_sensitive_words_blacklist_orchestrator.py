from __future__ import annotations

import logging
import threading

from backend.orchestrators.conversation_orchestrator import AskInput, ConversationOrchestrator
from backend.services.history_store import HistoryStore


class _Intent:
    def __init__(self, intent: str = "qa", confidence: float = 1.0):
        self.intent = intent
        self.confidence = confidence
        self.matched = []
        self.reason = ""


class _IntentService:
    def classify(self, question: str) -> _Intent:
        return _Intent()


class _ExplodingRagflowService:
    def get_session(self, chat_name: str):
        raise AssertionError("ragflow_service.get_session should not be called on safety input block")


class _ExplodingRagflowAgentService:
    def stream_completion_text(self, *args, **kwargs):
        raise AssertionError("ragflow_agent_service should not be called on safety input block")


class _Chunk:
    def __init__(self, content: str):
        self.content = content


class _Response:
    def __init__(self, contents: list[str]):
        self._contents = list(contents)
        self.closed = False

    def __iter__(self):
        for c in self._contents:
            if self.closed:
                return
            yield _Chunk(c)

    def close(self):
        self.closed = True


class _Session:
    def __init__(self, contents: list[str]):
        self._contents = contents

    def ask(self, question: str, stream: bool = False):
        assert stream is True
        return _Response(self._contents)


class _RagflowService:
    def __init__(self, contents: list[str]):
        self._contents = contents

    def get_session(self, chat_name: str):
        return _Session(self._contents)


class _RagflowAgentService:
    def stream_completion_text(self, *args, **kwargs):
        raise AssertionError("agent path not used in this test")


def _make_orch(*, store: HistoryStore, ragflow_service, ragflow_agent_service):
    logger = logging.getLogger("test")
    logger.addHandler(logging.NullHandler())

    def timings_set(request_id: str, **kwargs) -> None:
        return None

    def timings_get(request_id: str):
        return {}

    return ConversationOrchestrator(
        ragflow_service=ragflow_service,
        ragflow_agent_service=ragflow_agent_service,
        intent_service=_IntentService(),
        history_store=store,
        logger=logger,
        timings_set=timings_set,
        timings_get=timings_get,
        default_session=None,
    )


def test_orchestrator_blocks_sensitive_input(tmp_path):
    store = HistoryStore(tmp_path / "history.db", logger=logging.getLogger("test"))
    orch = _make_orch(store=store, ragflow_service=_ExplodingRagflowService(), ragflow_agent_service=_ExplodingRagflowAgentService())

    ragflow_config = {"kb_version": "kb1", "safety": {"blacklist": "秘密"}}
    inp = AskInput(question="  这是秘密  ", request_id="r1", client_id="c1", kind="ask", save_history=True)
    cancel_event = threading.Event()

    items = list(orch.stream_ask(inp=inp, ragflow_config=ragflow_config, cancel_event=cancel_event, t_submit=0.0))

    assert items[0]["done"] is False and "meta" in items[0]
    assert items[1]["safety"]["blocked"] is True
    assert items[1]["safety"]["where"] == "input"
    assert items[-1]["done"] is True
    assert store.list_by_time(limit=10) == []


def test_orchestrator_blocks_sensitive_output_stream(tmp_path):
    store = HistoryStore(tmp_path / "history.db", logger=logging.getLogger("test"))
    ragflow_service = _RagflowService(contents=["你好，", "你好，秘密"])
    orch = _make_orch(store=store, ragflow_service=ragflow_service, ragflow_agent_service=_RagflowAgentService())

    ragflow_config = {"kb_version": "kb1", "safety": {"blacklist": "秘密"}}
    inp = AskInput(question="你好", request_id="r1", client_id="c1", kind="ask", conversation_name="default", save_history=True)
    cancel_event = threading.Event()

    items = list(orch.stream_ask(inp=inp, ragflow_config=ragflow_config, cancel_event=cancel_event, t_submit=0.0))

    chunks = [it.get("chunk") for it in items if isinstance(it, dict) and it.get("chunk") is not None]
    assert any((it.get("safety") or {}).get("where") == "output" for it in items)
    assert all("秘密" not in (c or "") for c in chunks)
    assert items[-1]["done"] is True
    assert store.list_by_time(limit=10) == []
