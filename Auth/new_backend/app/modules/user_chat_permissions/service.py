from __future__ import annotations

import logging

from fastapi import HTTPException

from app.modules.user_chat_permissions.repo import UserChatPermissionsRepo

logger = logging.getLogger(__name__)


class UserChatPermissionsService:
    def __init__(self, repo: UserChatPermissionsRepo):
        self._repo = repo

    def get_user_chats_admin(self, user_id: str) -> list[str]:
        user = self._repo.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        chat_ids = self._repo.get_user_chats(user_id)
        logger.info("[GET USER CHATS] user=%s count=%s", user_id, len(chat_ids))
        return chat_ids

    def grant_chat_access_admin(self, *, user_id: str, chat_id: str, granted_by: str) -> str:
        user = self._repo.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        self._repo.grant_permission(user_id=user_id, chat_id=chat_id, granted_by=granted_by)
        return user.username

    def revoke_chat_access_admin(self, *, user_id: str, chat_id: str) -> str:
        user = self._repo.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        if not self._repo.revoke_permission(user_id=user_id, chat_id=chat_id):
            raise HTTPException(status_code=404, detail="权限不存在")
        return user.username

    def get_my_chats(self, user_id: str) -> list[str]:
        user = self._repo.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        if user.role == "admin":
            try:
                return self._repo.list_all_chat_ids()
            except Exception as e:
                logger.error("Failed to list all chats/agents: %s", e, exc_info=True)
                return []

        if not user.group_id:
            return []

        group = self._repo.get_permission_group(user.group_id)
        if not group:
            return []

        accessible_chats = group.get("accessible_chats", []) or []
        if len(accessible_chats) > 0:
            return accessible_chats

        try:
            return self._repo.list_all_chat_ids()
        except Exception as e:
            logger.error("Failed to list all chats/agents: %s", e, exc_info=True)
            return []

    def batch_grant_chats_admin(self, *, user_ids: list[str], chat_ids: list[str], granted_by: str) -> tuple[int, int]:
        valid_user_ids: list[str] = []
        for user_id in user_ids:
            if self._repo.get_user(user_id):
                valid_user_ids.append(user_id)
            else:
                raise HTTPException(status_code=404, detail=f"用户 {user_id} 不存在")

        revoked_count = 0
        for user_id in valid_user_ids:
            revoked_count += self._repo.revoke_all_user_permissions(user_id)

        granted_count = self._repo.grant_batch_permissions(user_ids=valid_user_ids, chat_ids=chat_ids, granted_by=granted_by)
        return granted_count, revoked_count

