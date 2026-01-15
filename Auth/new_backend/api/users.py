from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Annotated, Optional

from authx import TokenPayload
from core.security import auth
from core.permissions import UsersViewRequired, UsersManageRequired
from models.user import UserCreate, UserUpdate, UserResponse
from dependencies import AppDependencies


router = APIRouter()


def get_deps(request: Request) -> AppDependencies:
    return request.app.state.deps


@router.get("", response_model=list[UserResponse])
async def list_users(
    payload: UsersViewRequired,
    deps: AppDependencies = Depends(get_deps),
    role: Optional[str] = None,
    group_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 100,
):
    """List users with optional filters"""
    users = deps.user_store.list_users(role=role, status=status, limit=limit)

    result = []
    for u in users:
        # 获取权限组信息
        group = None
        if u.group_id:
            group = deps.permission_group_store.get_group(u.group_id)

        result.append(
            UserResponse(
                user_id=u.user_id,
                username=u.username,
                email=u.email,
                group_id=u.group_id,
                group_name=group['group_name'] if group else None,
                role=u.role,  # 保留role字段用于向后兼容
                status=u.status,
                created_at_ms=u.created_at_ms,
                last_login_at_ms=u.last_login_at_ms,
            )
        )
    return result


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    user_data: UserCreate,
    payload: UsersManageRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Create a new user"""
    try:
        # 如果没有指定权限组，使用默认的查看者组
        group_id = user_data.group_id
        if not group_id:
            # 查找默认的查看者权限组
            default_group = deps.permission_group_store.get_group_by_name("viewer")
            if default_group:
                group_id = default_group['group_id']
            else:
                raise HTTPException(status_code=400, detail="未找到默认权限组")

        # 获取权限组信息以设置role字段（向后兼容）
        group = deps.permission_group_store.get_group(group_id)
        if not group:
            raise HTTPException(status_code=400, detail="权限组不存在")

        user = deps.user_store.create_user(
            username=user_data.username,
            password=user_data.password,
            email=user_data.email,
            role=group['group_name'],  # 使用权限组名称作为role
            group_id=group_id,
            status=user_data.status,
            created_by=payload.sub,
        )
        return UserResponse(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
            group_id=user.group_id,
            group_name=group['group_name'],
            role=user.role,
            status=user.status,
            created_at_ms=user.created_at_ms,
            last_login_at_ms=user.last_login_at_ms,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    payload: UsersViewRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Get user by ID"""
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 获取权限组信息
    group = None
    if user.group_id:
        group = deps.permission_group_store.get_group(user.group_id)

    return UserResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        group_id=user.group_id,
        group_name=group['group_name'] if group else None,
        role=user.role,
        status=user.status,
        created_at_ms=user.created_at_ms,
        last_login_at_ms=user.last_login_at_ms,
    )


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    payload: UsersManageRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Update user"""
    # 如果要更新权限组，需要先验证权限组存在
    role = None
    if user_data.group_id is not None:
        group = deps.permission_group_store.get_group(user_data.group_id)
        if not group:
            raise HTTPException(status_code=400, detail="权限组不存在")
        role = group['group_name']

    user = deps.user_store.update_user(
        user_id=user_id,
        email=user_data.email,
        role=role,
        group_id=user_data.group_id,
        status=user_data.status,
    )
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 获取权限组信息
    group = None
    if user.group_id:
        group = deps.permission_group_store.get_group(user.group_id)

    return UserResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        group_id=user.group_id,
        group_name=group['group_name'] if group else None,
        role=user.role,
        status=user.status,
        created_at_ms=user.created_at_ms,
        last_login_at_ms=user.last_login_at_ms,
    )


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    payload: UsersManageRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Delete user"""
    success = deps.user_store.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"message": "用户已删除"}


@router.put("/{user_id}/password")
async def reset_password(
    user_id: str,
    new_password: str,
    payload: UsersManageRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Reset user password"""
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    deps.user_store.update_password(user_id, new_password)
    return {"message": "密码已重置"}
