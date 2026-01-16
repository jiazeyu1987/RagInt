from __future__ import annotations

from dependencies import AppDependencies


class UserChatPermissionsRepo:
    def __init__(self, deps: AppDependencies):
        self._deps = deps

    def get_user(self, user_id: str):
        return self._deps.user_store.get_by_user_id(user_id)

    def get_user_chats(self, user_id: str) -> list[str]:
        return self._deps.user_chat_permission_store.get_user_chats(user_id)

    def grant_permission(self, *, user_id: str, chat_id: str, granted_by: str) -> None:
        self._deps.user_chat_permission_store.grant_permission(user_id=user_id, chat_id=chat_id, granted_by=granted_by)

    def revoke_permission(self, *, user_id: str, chat_id: str) -> bool:
        return bool(self._deps.user_chat_permission_store.revoke_permission(user_id=user_id, chat_id=chat_id))

    def revoke_all_user_permissions(self, user_id: str) -> int:
        return int(self._deps.user_chat_permission_store.revoke_all_user_permissions(user_id))

    def grant_batch_permissions(self, *, user_ids: list[str], chat_ids: list[str], granted_by: str) -> int:
        return int(
            self._deps.user_chat_permission_store.grant_batch_permissions(
                user_ids=user_ids,
                chat_ids=chat_ids,
                granted_by=granted_by,
            )
        )

    def get_permission_group(self, group_id: int):
        return self._deps.permission_group_store.get_group(group_id)

    def list_all_chat_ids(self) -> list[str]:
        all_chats = self._deps.ragflow_chat_service.list_chats(page_size=1000)
        all_agents = self._deps.ragflow_chat_service.list_agents(page_size=1000)
        result: list[str] = []
        for chat in all_chats or []:
            if chat.get("id"):
                result.append(f"chat_{chat['id']}")
        for agent in all_agents or []:
            if agent.get("id"):
                result.append(f"agent_{agent['id']}")
        return result

