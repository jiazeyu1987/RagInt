from __future__ import annotations


class RagflowChatManager:
    def __init__(self, *, ragflow_service, default_session=None):
        self._ragflow_service = ragflow_service
        self._default_session = default_session

    def set_default_session(self, session) -> None:
        self._default_session = session

    def resolve_session(self, *, agent_id: str, conversation_name: str):
        if str(agent_id or "").strip():
            return None
        name = str(conversation_name or "").strip()
        if name:
            return self._ragflow_service.get_session(name)
        return self._default_session

    def list_chats(self) -> dict:
        return self._ragflow_service.list_chats()

    def list_agents(self) -> dict:
        return self._ragflow_service.list_agents()

    def create_new_session(self, chat_name: str) -> dict:
        return self._ragflow_service.create_new_session(chat_name)

    def clear_chat_sessions(self, chat_name: str) -> dict:
        return self._ragflow_service.clear_chat_sessions(chat_name)

    def ask_chat(self, *, chat_name: str, question: str) -> str:
        return self._ragflow_service.ask_chat(chat_name=chat_name, question=question)

    def ask_chat_once(
        self,
        *,
        chat_name: str,
        question: str,
        create_if_missing: bool = False,
        session_name: str = "One Shot Session",
    ) -> str:
        return self._ragflow_service.ask_chat_once(
            chat_name=chat_name,
            question=question,
            create_if_missing=create_if_missing,
            session_name=session_name,
        )
