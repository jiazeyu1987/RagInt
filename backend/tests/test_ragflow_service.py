from __future__ import annotations

import json
import builtins
import shutil
import uuid
from pathlib import Path

import pytest

from backend.services.ragflow_config_store import RagflowConfigStore
from backend.services.ragflow_agent_service import RagflowAgentService
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


class _EmptyClient(_Client):
    def list_chats(self, page: int = 1, page_size: int = 30, name: str | None = None):  # noqa: ARG002
        return []


class _NoneListClient(_Client):
    def list_chats(self, page: int = 1, page_size: int = 30, name: str | None = None):  # noqa: ARG002
        return None

    def list_datasets(self, page: int = 1, page_size: int = 30, name: str | None = None):  # noqa: ARG002
        return None


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


def test_clear_chat_sessions_returns_failure_when_session_list_api_fails():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    svc._sessions["hall_chat"] = {"id": "cached_session"}
    calls = []

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        calls.append((method, path, json_body))
        return {"code": 100, "message": "chat not found"}

    svc._api_request = fake_api_request  # type: ignore[method-assign]

    result = svc.clear_chat_sessions("hall_chat")

    assert result["ok"] is False
    assert result["deleted"] == 0
    assert result["error"] == "ragflow_list_sessions_failed"
    assert result["upstream"] == {"code": 100, "message": "chat not found"}
    assert svc._sessions["hall_chat"] == {"id": "cached_session"}
    assert calls == [
        ("GET", "/api/v1/chats/chat_1/sessions", None),
    ]


def test_clear_chat_sessions_returns_failure_when_delete_api_reports_not_ok():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    svc._sessions["hall_chat"] = {"id": "cached_session"}
    calls = []

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        calls.append((method, path, json_body))
        if method == "GET":
            return {"data": [{"id": "s1"}]}
        return {"ok": False, "message": "delete denied"}

    svc._api_request = fake_api_request  # type: ignore[method-assign]

    result = svc.clear_chat_sessions("hall_chat")

    assert result["ok"] is False
    assert result["deleted"] == 0
    assert result["error"] == "ragflow_delete_session_failed"
    assert result["session_ids"] == ["s1"]
    assert result["upstream"] == {"ok": False, "message": "delete denied"}
    assert svc._sessions["hall_chat"] == {"id": "cached_session"}
    assert calls == [
        ("GET", "/api/v1/chats/chat_1/sessions", None),
        ("DELETE", "/api/v1/chats/chat_1/sessions", {"ids": ["s1"]}),
    ]


def test_clear_chat_sessions_raises_when_session_list_shape_is_unexpected():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    svc._sessions["hall_chat"] = {"id": "cached_session"}

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        return {"data": {"docs": "not a list"}}

    svc._api_request = fake_api_request  # type: ignore[method-assign]

    with pytest.raises(RuntimeError, match="ragflow_api_response_unexpected_shape"):
        svc.clear_chat_sessions("hall_chat")

    assert svc._sessions["hall_chat"] == {"id": "cached_session"}


def test_clear_chat_sessions_preserves_cached_session_when_delete_api_raises():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()
    svc._sessions["hall_chat"] = {"id": "cached_session"}

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        if method == "GET":
            return {"data": [{"id": "s1"}]}
        raise RuntimeError("ragflow_delete_failed")

    svc._api_request = fake_api_request  # type: ignore[method-assign]

    with pytest.raises(RuntimeError, match="ragflow_delete_failed"):
        svc.clear_chat_sessions("hall_chat")

    assert svc._sessions["hall_chat"] == {"id": "cached_session"}


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


def test_ask_chat_once_raises_when_temp_session_delete_fails():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _Client()

    def fake_api_request(*, method: str, path: str, json_body=None, timeout: int = 15):  # noqa: ARG001
        raise RuntimeError("ragflow_delete_one_shot_session_failed")

    svc._api_request = fake_api_request  # type: ignore[method-assign]

    with pytest.raises(RuntimeError, match="ragflow_delete_one_shot_session_failed"):
        svc.ask_chat_once("hall_chat", "hello")


def test_list_chats_returns_empty_list_when_ragflow_has_no_chats():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _EmptyClient()
    svc.default_chat_name = "hall_chat"

    result = svc.list_chats()

    assert result == {"chats": [], "default": "hall_chat"}


def test_list_chats_raises_when_ragflow_is_not_initialized():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.default_chat_name = "hall_chat"

    with pytest.raises(RuntimeError, match="ragflow_not_initialized"):
        svc.list_chats()


def test_list_chats_raises_when_ragflow_returns_unexpected_none():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _NoneListClient()
    svc.default_chat_name = "hall_chat"

    with pytest.raises(RuntimeError, match="ragflow_list_chats_unexpected_response"):
        svc.list_chats()


def test_api_request_raises_when_response_json_cannot_be_parsed(monkeypatch):
    class _Response:
        content = b"<html>not json</html>"
        text = "<html>not json</html>"

        def raise_for_status(self):
            return None

        def json(self):
            raise ValueError("Expecting value")

    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc._last_loaded_cfg = {"api_key": "valid_key", "base_url": "http://ragflow.example"}  # noqa: SLF001

    monkeypatch.setattr("backend.services.ragflow_service.requests.request", lambda *args, **kwargs: _Response())

    with pytest.raises(RuntimeError, match="ragflow_api_response_json_parse_failed"):
        svc._api_request(method="GET", path="/api/v1/chats/chat_1/sessions")  # noqa: SLF001

    assert svc._api_payload_failed({"ok": False}) is True  # noqa: SLF001


def test_list_agents_returns_empty_list_when_ragflow_has_no_agents(monkeypatch):
    class _Response:
        content = b'{"data":[]}'

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):  # noqa: ANN001
            return False

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": []}

    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc._last_loaded_cfg = {"api_key": "valid_key", "base_url": "http://ragflow.example"}  # noqa: SLF001

    monkeypatch.setattr("backend.services.ragflow_service.requests.get", lambda *args, **kwargs: _Response())

    assert svc.list_agents() == {"agents": [], "default": None}


def test_list_agents_raises_when_api_key_is_invalid():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc._last_loaded_cfg = {"api_key": "", "base_url": "http://ragflow.example"}  # noqa: SLF001

    with pytest.raises(RuntimeError, match="ragflow_api_key_invalid"):
        svc.list_agents()


def test_list_agents_raises_when_fetch_fails(monkeypatch):
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc._last_loaded_cfg = {"api_key": "valid_key", "base_url": "http://ragflow.example"}  # noqa: SLF001

    def fail_get(*args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("connection refused")

    monkeypatch.setattr("backend.services.ragflow_service.requests.get", fail_get)

    with pytest.raises(RuntimeError, match="ragflow_agents_fetch_failed"):
        svc.list_agents()


def test_list_agents_raises_when_response_shape_is_unexpected(monkeypatch):
    class _Response:
        content = b'{"data":{"docs":[]}}'

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):  # noqa: ANN001
            return False

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": {"docs": []}}

    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc._last_loaded_cfg = {"api_key": "valid_key", "base_url": "http://ragflow.example"}  # noqa: SLF001

    monkeypatch.setattr("backend.services.ragflow_service.requests.get", lambda *args, **kwargs: _Response())

    with pytest.raises(RuntimeError, match="ragflow_agents_unexpected_response"):
        svc.list_agents()


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


def test_get_session_raises_when_chat_list_returns_unexpected_none():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.client = _NoneListClient()

    with pytest.raises(RuntimeError, match="ragflow_list_chats_unexpected_response"):
        svc.get_session("target")


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


def test_load_config_returns_empty_config_when_file_is_missing(tmp_path):
    svc = RagflowService(tmp_path / "missing.json", logger=_Logger())

    assert svc.load_config(force=True) == {}


def test_load_config_raises_when_file_json_is_invalid(tmp_path):
    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text("{not valid json", encoding="utf-8")
    svc = RagflowService(config_path, logger=_Logger())

    with pytest.raises(json.JSONDecodeError):
        svc.load_config(force=True)


def test_load_config_raises_when_file_json_is_not_object(tmp_path):
    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text(json.dumps(["not", "an", "object"]), encoding="utf-8")
    svc = RagflowService(config_path, logger=_Logger())

    with pytest.raises(RuntimeError, match="ragflow_config_file_invalid"):
        svc.load_config(force=True)


def test_load_config_raises_when_file_read_fails(tmp_path, monkeypatch):
    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text(json.dumps({"api_key": "file_key"}), encoding="utf-8")
    svc = RagflowService(config_path, logger=_Logger())
    real_open = builtins.open

    def fail_open(path, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        if Path(path) == config_path:
            raise OSError("permission denied")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr("backend.services.ragflow_service.open", fail_open, raising=False)

    with pytest.raises(OSError, match="permission denied"):
        svc.load_config(force=True)


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


def test_load_config_raises_when_db_read_fails_without_file_bootstrap(tmp_path, monkeypatch):
    class _FailingStore:
        def get(self, scope_id=None):  # noqa: ARG002
            raise RuntimeError("db unavailable")

        def upsert(self, scope_id=None, config=None):  # noqa: ARG002
            raise AssertionError("load_config must not bootstrap when DB read fails")

    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text(json.dumps({"api_key": "file_key"}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("RAGFLOW_API_KEY", "env_key")
    svc = RagflowService(config_path, logger=_Logger(), config_store=_FailingStore())

    with pytest.raises(RuntimeError, match="db unavailable"):
        svc.load_config(force=True)


def test_load_config_raises_when_db_bootstrap_write_fails(tmp_path, monkeypatch):
    class _FailingStore:
        def get(self, scope_id=None):  # noqa: ARG002
            return None

        def upsert(self, scope_id=None, config=None):  # noqa: ARG002
            raise RuntimeError("db write unavailable")

    monkeypatch.setenv("RAGFLOW_API_KEY", "env_key")
    svc = RagflowService(tmp_path / "missing.json", logger=_Logger(), config_store=_FailingStore())

    with pytest.raises(RuntimeError, match="db write unavailable"):
        svc.load_config(force=True)


def test_api_request_raises_when_base_url_is_missing():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc._last_loaded_cfg = {"api_key": "valid_key"}  # noqa: SLF001

    with pytest.raises(RuntimeError, match="ragflow_base_url_missing"):
        svc._api_request(method="GET", path="/api/v1/chats")  # noqa: SLF001


def test_list_agents_raises_when_base_url_is_missing():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc._last_loaded_cfg = {"api_key": "valid_key"}  # noqa: SLF001

    with pytest.raises(RuntimeError, match="ragflow_base_url_missing"):
        svc.list_agents()


def test_init_raises_when_api_key_is_missing():
    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.load_config = lambda force=False: {"base_url": "http://ragflow.example"}  # type: ignore[method-assign]

    with pytest.raises(RagflowInitError) as exc:
        svc.init()

    assert exc.value.code == "ragflow_api_key_invalid"


def test_init_raises_when_dataset_list_returns_unexpected_none(monkeypatch):
    class _Connection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):  # noqa: ANN001
            return False

    svc = RagflowService(Path("dummy.json"), logger=_Logger())
    svc.load_config = lambda force=False: {  # type: ignore[method-assign]
        "api_key": "valid_key",
        "base_url": "http://ragflow.example",
        "dataset_name": "kb",
        "default_conversation_name": "hall_chat",
    }
    monkeypatch.setattr("backend.services.ragflow_service.socket.create_connection", lambda *args, **kwargs: _Connection())
    monkeypatch.setattr("backend.services.ragflow_service.RAGFlow", lambda *args, **kwargs: _NoneListClient())

    with pytest.raises(RuntimeError, match="ragflow_list_datasets_unexpected_response"):
        svc.init()


def test_agent_load_config_raises_when_file_stat_fails(tmp_path, monkeypatch):
    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text(json.dumps({"api_key": "file_key"}), encoding="utf-8")
    svc = RagflowAgentService(config_path, logger=_Logger())

    def fail_stat(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        if self == config_path:
            raise OSError("stat denied")
        return original_stat(self, *args, **kwargs)

    original_stat = Path.stat
    monkeypatch.setattr(Path, "stat", fail_stat)

    with pytest.raises(OSError, match="stat denied"):
        svc.load_config(force=True)


def test_agent_auth_headers_raises_when_base_url_is_missing():
    svc = RagflowAgentService(
        Path("dummy.json"),
        logger=_Logger(),
        config_loader=lambda force=False: {"api_key": "valid_key"},
    )

    with pytest.raises(RuntimeError, match="ragflow_base_url_missing"):
        svc._auth_headers()  # noqa: SLF001


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
