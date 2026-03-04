from __future__ import annotations

from pathlib import Path

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
