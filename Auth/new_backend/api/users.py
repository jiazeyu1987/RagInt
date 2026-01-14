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
    status: Optional[str] = None,
    limit: int = 100,
):
    """List users with optional filters"""
    users = deps.user_store.list_users(role=role, status=status, limit=limit)
    return [
        UserResponse(
            user_id=u.user_id,
            username=u.username,
            email=u.email,
            role=u.role,
            status=u.status,
            created_at_ms=u.created_at_ms,
            last_login_at_ms=u.last_login_at_ms,
        )
        for u in users
    ]


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    user_data: UserCreate,
    payload: UsersManageRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Create a new user"""
    try:
        user = deps.user_store.create_user(
            username=user_data.username,
            password=user_data.password,
            email=user_data.email,
            role=user_data.role,
            status=user_data.status,
            created_by=payload.sub,
        )
        return UserResponse(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
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
    return UserResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
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
    user = deps.user_store.update_user(
        user_id=user_id,
        email=user_data.email,
        role=user_data.role,
        status=user_data.status,
    )
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
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
