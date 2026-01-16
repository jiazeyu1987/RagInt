from __future__ import annotations

from typing import Any

from dependencies import AppDependencies


class PermissionGroupsRepo:
    def __init__(self, deps: AppDependencies):
        self._deps = deps

    def list_groups(self) -> list[dict[str, Any]]:
        return self._deps.permission_group_store.list_groups()

    def get_group(self, group_id: int) -> dict[str, Any] | None:
        return self._deps.permission_group_store.get_group(group_id)

    def create_group(self, payload: dict[str, Any]) -> int | None:
        return self._deps.permission_group_store.create_group(**payload)

    def update_group(self, group_id: int, payload: dict[str, Any]) -> bool:
        return bool(self._deps.permission_group_store.update_group(group_id=group_id, **payload))

    def delete_group(self, group_id: int) -> bool:
        return bool(self._deps.permission_group_store.delete_group(group_id))

    def list_knowledge_bases(self) -> list[dict[str, str]]:
        datasets = self._deps.ragflow_service.list_datasets()
        if not isinstance(datasets, list):
            return []
        return [{"id": ds["name"], "name": ds["name"]} for ds in datasets if ds.get("name")]

    def list_chat_agents(self) -> list[dict[str, str]]:
        chats = self._deps.ragflow_chat_service.list_chats()
        agents = self._deps.ragflow_chat_service.list_agents()

        chat_list: list[dict[str, str]] = []
        for chat in chats or []:
            if chat.get("id") and chat.get("name"):
                chat_list.append({"id": f"chat_{chat['id']}", "name": chat["name"], "type": "chat"})

        for agent in agents or []:
            if agent.get("id") and agent.get("name"):
                chat_list.append({"id": f"agent_{agent['id']}", "name": agent["name"], "type": "agent"})

        return chat_list

