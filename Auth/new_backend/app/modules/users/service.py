from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from models.user import UserCreate, UserUpdate, UserResponse

from app.modules.users.repo import UsersRepo


class UsersService:
    def __init__(self, repo: UsersRepo):
        self._repo = repo

    def _build_permission_groups(self, group_ids: list[int] | None) -> list[dict]:
        result: list[dict] = []
        for gid in group_ids or []:
            pg = self._repo.get_permission_group(gid)
            if pg:
                result.append({"group_id": gid, "group_name": pg.get("group_name", "")})
        return result

    def _to_response(self, user) -> UserResponse:
        group = self._repo.get_permission_group(user.group_id) if user.group_id else None
        return UserResponse(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
            group_id=user.group_id,
            group_name=group["group_name"] if group else None,
            group_ids=user.group_ids,
            permission_groups=self._build_permission_groups(user.group_ids),
            role=user.role,
            status=user.status,
            created_at_ms=user.created_at_ms,
            last_login_at_ms=user.last_login_at_ms,
        )

    def list_users(
        self,
        *,
        role: Optional[str],
        status: Optional[str],
        limit: int,
    ) -> list[UserResponse]:
        users = self._repo.list_users(role=role, status=status, limit=limit)
        return [self._to_response(u) for u in users]

    def create_user(self, *, user_data: UserCreate, created_by: str) -> UserResponse:
        group_ids = user_data.group_ids
        if not group_ids:
            group_id = user_data.group_id
            if not group_id:
                default_group = self._repo.get_group_by_name("viewer")
                if default_group:
                    group_id = default_group["group_id"]
                else:
                    raise HTTPException(status_code=400, detail="未找到默认权限组")
            group_ids = [group_id] if group_id else []

        for gid in group_ids:
            if not self._repo.get_permission_group(gid):
                raise HTTPException(status_code=400, detail=f"权限组 {gid} 不存在")

        first_group = self._repo.get_permission_group(group_ids[0]) if group_ids else None
        role_name = first_group["group_name"] if first_group else "viewer"

        user = self._repo.create_user(
            username=user_data.username,
            password=user_data.password,
            email=user_data.email,
            role=role_name,
            group_id=group_ids[0] if group_ids else None,
            status=user_data.status,
            created_by=created_by,
        )

        if group_ids:
            self._repo.set_user_permission_groups(user.user_id, group_ids)

        user = self._repo.get_user(user.user_id)
        return self._to_response(user)

    def get_user(self, user_id: str) -> UserResponse:
        user = self._repo.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        return self._to_response(user)

    def update_user(self, *, user_id: str, user_data: UserUpdate) -> UserResponse:
        group_ids = user_data.group_ids
        role = None
        group_id = None

        if group_ids is not None:
            for gid in group_ids:
                if not self._repo.get_permission_group(gid):
                    raise HTTPException(status_code=400, detail=f"权限组 {gid} 不存在")

            if len(group_ids) > 0:
                first_group = self._repo.get_permission_group(group_ids[0])
                role = first_group["group_name"] if first_group else None
                group_id = group_ids[0]
        elif user_data.group_id is not None:
            group = self._repo.get_permission_group(user_data.group_id)
            if not group:
                raise HTTPException(status_code=400, detail="权限组不存在")
            role = group["group_name"]
            group_id = user_data.group_id
            group_ids = [group_id]

        user = self._repo.update_user(
            user_id=user_id,
            email=user_data.email,
            role=role,
            group_id=group_id,
            status=user_data.status,
        )
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        if group_ids is not None:
            self._repo.set_user_permission_groups(user.user_id, group_ids)

        user = self._repo.get_user(user.user_id)
        return self._to_response(user)

    def delete_user(self, user_id: str) -> None:
        if not self._repo.delete_user(user_id):
            raise HTTPException(status_code=404, detail="用户不存在")

    def reset_password(self, user_id: str, new_password: str) -> None:
        user = self._repo.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        self._repo.update_password(user_id, new_password)

