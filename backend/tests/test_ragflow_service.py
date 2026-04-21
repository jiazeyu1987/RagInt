from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

import pytest

from backend.services.ragflow_config_store import RagflowConfigStore
from backend.services.ragflow_service import RagflowInitError, RagflowService


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
    def list_chats(self, page: int = 1, page_size: int = 30, name: str | None = None):  # noqa: ARG002
        chats = [_Chat("chat_1", "hall_chat"), _Chat("chat_2", "voice_mode")]
        if name:
            chats = [chat for chat in chats if chat.name == name]
        start = (page - 1) * page_size
        end = start + page_size
        return chats[start:end]

    def list_datasets(self, page: int = 1, page_size: int = 30, name: str | None = None):  # noqa: ARG002
        return []


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
    result = svc.clear_chat_sessions("hall_chat")

    assert result["ok"] is True
    assert result["deleted"] == 2
    assert calls == [
        ("GET", "/api/v1/chats/chat_1/sessions", None),
        ("DELETE", "/api/v1/chats/chat_1/sessions", {"ids": ["s1", "s2"]}),
    ]


def test_create_new_session_replaces_cached_session():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    svc._sessions["hall_chat"] = {"id": "old_session"}

    result = svc.create_new_session("hall_chat")

    assert result["ok"] is True
    assert result["chat_name"] == "hall_chat"
    assert result["session_id"] == "chat_1_session_new"
    assert getattr(svc._sessions["hall_chat"], "id", "") == "chat_1_session_new"


def test_ask_chat_reuses_or_creates_persistent_session():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()

    result = svc.ask_chat("voice_mode", "hello")

    assert result == "echo:hello"
    assert getattr(svc._sessions["voice_mode"], "id", "") == "chat_2_session_new"


def test_ask_chat_once_returns_text_and_deletes_temp_session():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    calls = []

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        calls.append((method, path, json_body))
        return {"code": 0, "data": True}

    svc._api_request = fake_api_request  # type: ignore[method-assign]

    result = svc.ask_chat_once("hall_chat", "hello")

    assert result == "echo:hello"
    assert calls == [
        ("DELETE", "/api/v1/chats/chat_1/sessions", {"ids": ["chat_1_session_new"]}),
    ]


def test_find_chat_by_name_uses_server_name_filter_instead_of_first_page_only():
    class _PagedClient:
        def __init__(self):
            self.calls = []

        def list_chats(self, page: int = 1, page_size: int = 30, name: str | None = None):
            self.calls.append((page, page_size, name))
            if name == "target":
                return [_Chat("chat_target", "target")]
            if page == 1:
                return [_Chat(f"chat_{idx}", f"chat_{idx}") for idx in range(page_size)]
            return []

    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _PagedClient()

    result = svc.get_session("target")

    assert getattr(result, "id", "") == "chat_target_session_new"
    assert svc.client.calls == [(1, 100, "target")]


def test_get_session_recovers_when_create_chat_hits_duplicate_name():
    class _DuplicateCreateClient:
        def __init__(self):
            self.list_calls = []
            self.create_calls = []

        def list_chats(self, page: int = 1, page_size: int = 30, name: str | None = None):
            self.list_calls.append((page, page_size, name))
            if name == "target" and len(self.list_calls) >= 2:
                return [_Chat("chat_target", "target")]
            return []

        def create_chat(self, name: str, dataset_ids=None):  # noqa: ARG002
            self.create_calls.append(name)
            raise Exception("Duplicated chat name in creating chat.")

    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _DuplicateCreateClient()

    result = svc.get_session("target")

    assert getattr(result, "id", "") == "chat_target_session_new"
    assert svc.client.create_calls == ["target"]
    assert svc.client.list_calls == [(1, 100, "target"), (1, 100, "target")]


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


def test_init_raises_clear_error_when_base_url_is_unreachable(monkeypatch):
    temp_root = (Path(__file__).resolve().parent.parent / "data" / "tmp_test_rw").resolve()
    temp_root.mkdir(parents=True, exist_ok=True)
    temp_dir = temp_root / f"ragflow_init_{uuid.uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=False)
    store = RagflowConfigStore(temp_dir / "ragflow_config.db")
    store.upsert(config={"api_key": "db_key", "base_url": "http://127.0.0.1:9380"})
    svc = RagflowService(temp_dir / "missing.json", logger=_Logger(), config_store=store)

    def fail_create_connection(_address, timeout=None):  # noqa: ANN001
        raise ConnectionRefusedError("[WinError 10061] 由于目标计算机积极拒绝，无法连接。")

    def fail_ragflow_ctor(*args, **kwargs):  # noqa: ANN002, ANN003
        raise AssertionError("RAGFlow SDK should not be constructed when base_url is unreachable")

    monkeypatch.setattr("backend.services.ragflow_service.socket.create_connection", fail_create_connection)
    monkeypatch.setattr("backend.services.ragflow_service.RAGFlow", fail_ragflow_ctor)

    try:
        with pytest.raises(RagflowInitError) as exc:
            svc.init()

        err = exc.value
        assert err.code == "ragflow_base_url_unreachable"
        assert err.details["base_url"] == "http://127.0.0.1:9380"
        assert err.details["host"] == "127.0.0.1"
        assert err.details["port"] == 9380
        assert "http://127.0.0.1:9380" in str(err)
        assert "请先启动 RAGFlow 服务" in str(err)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
