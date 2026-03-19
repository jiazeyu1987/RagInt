from __future__ import annotations

from backend.services.ragflow_chat_manager import RagflowChatManager


class _Svc:
    def __init__(self):
        self.calls = []

    def get_session(self, chat_name: str):
        self.calls.append(("get_session", chat_name))
        return {"session": chat_name}

    def list_chats(self):
        self.calls.append(("list_chats",))
        return {"chats": [{"name": "展厅聊天"}]}

    def list_agents(self):
        self.calls.append(("list_agents",))
        return {"agents": [{"id": "a1"}]}

    def create_new_session(self, chat_name: str):
        self.calls.append(("create_new_session", chat_name))
        return {"ok": True, "chat_name": chat_name}

    def clear_chat_sessions(self, chat_name: str):
        self.calls.append(("clear_chat_sessions", chat_name))
        return {"ok": True, "chat_name": chat_name}

    def ask_chat(self, *, chat_name: str, question: str):
        self.calls.append(("ask_chat", chat_name, question))
        return "ok"

    def ask_chat_once(self, *, chat_name: str, question: str, create_if_missing: bool = False, session_name: str = "One Shot Session"):
        self.calls.append(("ask_chat_once", chat_name, question, bool(create_if_missing), session_name))
        return "ok_once"


def test_resolve_session_uses_default_session_when_chat_name_absent():
    svc = _Svc()
    mgr = RagflowChatManager(ragflow_service=svc, default_session={"session": "default"})
    assert mgr.resolve_session(agent_id="", conversation_name="") == {"session": "default"}
    assert svc.calls == []


def test_resolve_session_skips_chat_lookup_for_agent_mode():
    svc = _Svc()
    mgr = RagflowChatManager(ragflow_service=svc, default_session={"session": "default"})
    assert mgr.resolve_session(agent_id="agent-1", conversation_name="展厅聊天") is None
    assert svc.calls == []


def test_chat_manager_delegates_service_methods():
    svc = _Svc()
    mgr = RagflowChatManager(ragflow_service=svc, default_session=None)
    assert mgr.list_chats()["chats"][0]["name"] == "展厅聊天"
    assert mgr.list_agents()["agents"][0]["id"] == "a1"
    assert mgr.create_new_session("展厅聊天")["ok"] is True
    assert mgr.clear_chat_sessions("展厅聊天")["ok"] is True
    assert mgr.ask_chat(chat_name="展厅聊天", question="hello") == "ok"
    assert mgr.ask_chat_once(chat_name="展厅聊天", question="hello", create_if_missing=True, session_name="tmp") == "ok_once"
