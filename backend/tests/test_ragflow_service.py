from __future__ import annotations

import json
from pathlib import Path

from backend.services.ragflow_config_store import RagflowConfigStore
from backend.services.ragflow_service import RagflowService


class _Session:
    def __init__(self, session_id: str, name: str):
        self.id = session_id
        self.name = name

    def ask(self, question: str, stream: bool = False):  # noqa: ARG002
        return {"content": f"echo:{question}"}


class _Chat:
    def __init__(self, chat_id: str, name: str):
        self.id = chat_id
        self.name = name

    def create_session(self, name: str):
        return _Session(f"{self.id}_session_new", name)


class _Client:
    def list_chats(self):
        return [_Chat("chat_1", "展厅聊天"), _Chat("chat_2", "语音模型")]


class _Logger:
    def info(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def warning(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def error(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


def test_clear_chat_sessions_uses_bulk_delete_endpoint():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    calls = []

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        calls.append((method, path, json_body))
        if method == "GET":
            return {"data": [{"id": "s1"}, {"id": "s2"}]}
        return {"code": 0, "data": True}

    svc._api_request = fake_api_request  # type: ignore[method-assign]
    result = svc.clear_chat_sessions("展厅聊天")

    assert result["ok"] is True
    assert result["deleted"] == 2
    assert calls == [
        ("GET", "/api/v1/chats/chat_1/sessions", None),
        ("DELETE", "/api/v1/chats/chat_1/sessions", {"ids": ["s1", "s2"]}),
    ]


def test_create_new_session_replaces_cached_session():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    svc._sessions["展厅聊天"] = {"id": "old_session"}

    result = svc.create_new_session("展厅聊天")

    assert result["ok"] is True
    assert result["chat_name"] == "展厅聊天"
    assert result["session_id"] == "chat_1_session_new"
    assert getattr(svc._sessions["展厅聊天"], "id", "") == "chat_1_session_new"


def test_ask_chat_reuses_or_creates_persistent_session():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()

    result = svc.ask_chat("语音模型", "hello")

    assert result == "echo:hello"
    assert getattr(svc._sessions["语音模型"], "id", "") == "chat_2_session_new"


def test_ask_chat_once_returns_text_and_deletes_temp_session():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    calls = []

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        calls.append((method, path, json_body))
        return {"code": 0, "data": True}

    svc._api_request = fake_api_request  # type: ignore[method-assign]

    result = svc.ask_chat_once("展厅聊天", "hello")

    assert result == "echo:hello"
    assert calls == [
        ("DELETE", "/api/v1/chats/chat_1/sessions", {"ids": ["chat_1_session_new"]}),
    ]


def test_load_config_bootstraps_from_file_to_db_when_enabled(tmp_path, monkeypatch):
    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text(
        json.dumps({"api_key": "file_key", "base_url": "http://127.0.0.1:9380"}, ensure_ascii=False),
        encoding="utf-8",
    )
    store = RagflowConfigStore(tmp_path / "ragflow_config.db")
    monkeypatch.setenv("RAGINT_ENABLE_LEGACY_FILE_BOOTSTRAP", "1")
    svc = RagflowService(config_path, logger=_Logger(), config_store=store)

    loaded = svc.load_config(force=True)
    assert loaded["api_key"] == "file_key"
    assert loaded["base_url"] == "http://127.0.0.1:9380"

    rec = store.get()
    assert rec is not None
    assert rec.config["api_key"] == "file_key"
    assert rec.config["base_url"] == "http://127.0.0.1:9380"


def test_save_config_writes_db_when_store_enabled(tmp_path):
    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text(json.dumps({"api_key": "legacy_key"}, ensure_ascii=False), encoding="utf-8")
    store = RagflowConfigStore(tmp_path / "ragflow_config.db")
    svc = RagflowService(config_path, logger=_Logger(), config_store=store)

    saved = svc.save_config({"api_key": "db_key", "base_url": "http://127.0.0.1:9380", "__meta": {"x": 1}})
    assert saved["api_key"] == "db_key"
    assert saved["base_url"] == "http://127.0.0.1:9380"

    rec = store.get()
    assert rec is not None
    assert rec.config["api_key"] == "db_key"
    assert "__meta" not in rec.config


def test_db_config_not_overridden_by_env_after_bootstrap(tmp_path, monkeypatch):
    store = RagflowConfigStore(tmp_path / "ragflow_config.db")
    store.upsert(config={"api_key": "db_key", "base_url": "http://db.example"})
    monkeypatch.setenv("RAGFLOW_API_KEY", "env_key")

    svc = RagflowService(tmp_path / "missing.json", logger=_Logger(), config_store=store)
    loaded = svc.load_config(force=True)
    assert loaded["api_key"] == "db_key"


def test_env_bootstrap_used_only_when_db_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("RAGFLOW_API_KEY", "env_key")
    monkeypatch.setenv("RAGFLOW_BASE_URL", "http://env.example")

    store = RagflowConfigStore(tmp_path / "ragflow_config.db")
    svc = RagflowService(tmp_path / "missing.json", logger=_Logger(), config_store=store)
    loaded = svc.load_config(force=True)
    assert loaded["api_key"] == "env_key"
    assert loaded["base_url"] == "http://env.example"

    # Once persisted, DB wins even if env changes.
    monkeypatch.setenv("RAGFLOW_API_KEY", "env_key_changed")
    loaded2 = svc.load_config(force=True)
    assert loaded2["api_key"] == "env_key"
