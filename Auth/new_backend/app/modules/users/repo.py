from __future__ import annotations

from typing import Any, Optional

from dependencies import AppDependencies


class UsersRepo:
    def __init__(self, deps: AppDependencies):
        self._deps = deps

    def list_users(self, *, role: Optional[str], status: Optional[str], limit: int):
        return self._deps.user_store.list_users(role=role, status=status, limit=limit)

    def get_user(self, user_id: str):
        return self._deps.user_store.get_by_user_id(user_id)

    def create_user(self, **kwargs):
        return self._deps.user_store.create_user(**kwargs)

    def update_user(self, **kwargs):
        return self._deps.user_store.update_user(**kwargs)

    def delete_user(self, user_id: str) -> bool:
        return bool(self._deps.user_store.delete_user(user_id))

    def update_password(self, user_id: str, new_password: str) -> None:
        self._deps.user_store.update_password(user_id, new_password)

    def set_user_permission_groups(self, user_id: str, group_ids: list[int]) -> None:
        self._deps.user_store.set_user_permission_groups(user_id, group_ids)

    def get_permission_group(self, group_id: int) -> dict[str, Any] | None:
        return self._deps.permission_group_store.get_group(group_id)

    def get_group_by_name(self, name: str) -> dict[str, Any] | None:
        return self._deps.permission_group_store.get_group_by_name(name)

