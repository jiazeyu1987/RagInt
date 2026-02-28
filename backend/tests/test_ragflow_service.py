from __future__ import annotations

from pathlib import Path

from backend.services.ragflow_service import RagflowService


class _Chat:
    def __init__(self, chat_id: str, name: str):
        self.id = chat_id
        self.name = name


class _Client:
    def list_chats(self):
        return [_Chat("chat_1", "展厅聊天")]


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
