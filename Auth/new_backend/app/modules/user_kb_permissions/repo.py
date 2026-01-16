from __future__ import annotations

from typing import Any

from dependencies import AppDependencies


class UserKbPermissionsRepo:
    def __init__(self, deps: AppDependencies):
        self._deps = deps

    def get_user(self, user_id: str):
        return self._deps.user_store.get_by_user_id(user_id)

    def get_user_kbs(self, user_id: str) -> list[str]:
        return self._deps.user_kb_permission_store.get_user_kbs(user_id)

    def grant_permission(self, *, user_id: str, kb_id: str, granted_by: str) -> None:
        self._deps.user_kb_permission_store.grant_permission(user_id=user_id, kb_id=kb_id, granted_by=granted_by)

    def revoke_permission(self, *, user_id: str, kb_id: str) -> bool:
        return bool(self._deps.user_kb_permission_store.revoke_permission(user_id=user_id, kb_id=kb_id))

    def grant_batch_permissions(self, *, user_ids: list[str], kb_ids: list[str], granted_by: str) -> int:
        return int(
            self._deps.user_kb_permission_store.grant_batch_permissions(
                user_ids=user_ids,
                kb_ids=kb_ids,
                granted_by=granted_by,
            )
        )

    def get_permission_group(self, group_id: int) -> dict[str, Any] | None:
        return self._deps.permission_group_store.get_group(group_id)

    def list_all_kb_ids(self) -> list[str]:
        datasets = self._deps.ragflow_service.list_datasets()
        return [ds.get("name") for ds in datasets or [] if ds.get("name")]

