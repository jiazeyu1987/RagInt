from __future__ import annotations

import logging
import threading
import time

import pytest

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
        raise AssertionError("ragflow_service.get_session should not be called on cache hit")


class _ExplodingRagflowAgentService:
    def ask_stream(self, *args, **kwargs):
        raise AssertionError("ragflow_agent_service.ask_stream should not be called on cache hit")


def test_history_store_cache_hit_miss_and_ttl(tmp_path):
    db_path = tmp_path / "history.db"
    store = HistoryStore(db_path, logger=logging.getLogger("test"))

    assert store.cache_get(question=" hello ", kb_version="v1") is None
    assert store.cache_put(question=" hello ", answer="world", kb_version="v1", ttl_s=10, now_ms=1_000) is True
    assert store.cache_get(question="hello", kb_version="v1", now_ms=1_001) == "world"

    # kb-version mismatch => miss
    assert store.cache_get(question="hello", kb_version="v2", now_ms=1_001) is None

    # ttl expiry => miss
    assert store.cache_get(question="hello", kb_version="v1", now_ms=1_000 + 10_000 + 1) is None


def test_history_store_cache_get_fails_fast_on_blank_cached_answer(tmp_path):
    # Given a persisted cache row exists but its required answer field is corrupt
    db_path = tmp_path / "history.db"
    store = HistoryStore(db_path, logger=logging.getLogger("test"))
    assert store.cache_put(question="hello", answer="world", kb_version="v1", ttl_s=10, now_ms=1_000) is True
    with store._connect() as conn:  # noqa: SLF001 - unit test corrupts persisted cache state.
        conn.execute(
            "UPDATE qa_cache SET answer = ? WHERE normalized_question = ? AND kb_version = ?",
            ("", "hello", "v1"),
        )
        conn.commit()

    # When reading that row, Then it is rejected instead of being treated as a miss
    with pytest.raises(ValueError, match=r"qa_cache\.answer is required"):
        store.cache_get(question="hello", kb_version="v1", now_ms=1_001)


def test_history_store_cache_get_fails_fast_on_bad_expiry_timestamp(tmp_path):
    # Given a persisted cache row exists but its expiry timestamp is corrupt
    db_path = tmp_path / "history.db"
    store = HistoryStore(db_path, logger=logging.getLogger("test"))
    assert store.cache_put(question="hello", answer="world", kb_version="v1", ttl_s=10, now_ms=1_000) is True
    with store._connect() as conn:  # noqa: SLF001 - unit test corrupts persisted cache state.
        conn.execute(
            "UPDATE qa_cache SET expires_at_ms = ? WHERE normalized_question = ? AND kb_version = ?",
            ("bad-timestamp", "hello", "v1"),
        )
        conn.commit()

    # When reading that row, Then it is rejected instead of being treated as a miss
    with pytest.raises(ValueError, match=r"qa_cache\.expires_at_ms must be an integer"):
        store.cache_get(question="hello", kb_version="v1", now_ms=1_001)


def test_history_store_cache_get_propagates_storage_read_errors(tmp_path, monkeypatch):
    # Given the cache storage cannot be read
    db_path = tmp_path / "history.db"
    store = HistoryStore(db_path, logger=logging.getLogger("test"))

    def fail_connect():
        raise OSError("storage unavailable")

    monkeypatch.setattr(store, "_connect", fail_connect)

    # When cache lookup is attempted, Then the storage error is surfaced
    with pytest.raises(OSError, match="storage unavailable"):
        store.cache_get(question="hello", kb_version="v1", now_ms=1_001)


def test_orchestrator_short_circuits_on_cache_hit(tmp_path):
    db_path = tmp_path / "history.db"
    store = HistoryStore(db_path, logger=logging.getLogger("test"))
    now_ms = int(time.time() * 1000)
    store.cache_put(question="hello", answer="cache hit", kb_version="kb1", ttl_s=60, now_ms=now_ms)

    logger = logging.getLogger("test")
    logger.addHandler(logging.NullHandler())

    def timings_set(request_id: str, **kwargs) -> None:
        return None

    def timings_get(request_id: str):
        return {}

    orch = ConversationOrchestrator(
        ragflow_service=_ExplodingRagflowService(),
        ragflow_agent_service=_ExplodingRagflowAgentService(),
        intent_service=_IntentService(),
        history_store=store,
        logger=logger,
        timings_set=timings_set,
        timings_get=timings_get,
        default_session=None,
    )

    ragflow_config = {"kb_version": "kb1", "qa_cache": {"enabled": True, "ttl_s": 60}}
    inp = AskInput(question="  hello  ", request_id="r1", client_id="c1", kind="ask", save_history=True)
    cancel_event = threading.Event()

    items = list(orch.stream_ask(inp=inp, ragflow_config=ragflow_config, cancel_event=cancel_event, t_submit=0.0))

    assert items[0]["done"] is False
    assert "meta" in items[0]
    chunks = [item for item in items if item.get("chunk")]
    assert chunks[0]["chunk"] == "cache hit"
    assert chunks[0]["done"] is False
    assert any(item.get("done") is True for item in items)
