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

        # 构建权限组详情列表
        permission_groups = []
        if u.group_ids and len(u.group_ids) > 0:
            for gid in u.group_ids:
                pg = deps.permission_group_store.get_group(gid)
                if pg:
                    permission_groups.append({
                        'group_id': gid,
                        'group_name': pg.get('group_name', ''),
                    })

        result.append(
            UserResponse(
                user_id=u.user_id,
                username=u.username,
                email=u.email,
                group_id=u.group_id,
                group_name=group['group_name'] if group else None,
                group_ids=u.group_ids,  # 新字段
                permission_groups=permission_groups,  # 新字段
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
        # 支持多个权限组
        group_ids = user_data.group_ids
        if not group_ids:
            # 向后兼容：使用单个 group_id
            group_id = user_data.group_id
            if not group_id:
                # 查找默认的查看者权限组
                default_group = deps.permission_group_store.get_group_by_name("viewer")
                if default_group:
                    group_id = default_group['group_id']
                else:
                    raise HTTPException(status_code=400, detail="未找到默认权限组")
            group_ids = [group_id] if group_id else []

        # 验证所有权限组存在
        for gid in group_ids:
            group = deps.permission_group_store.get_group(gid)
            if not group:
                raise HTTPException(status_code=400, detail=f"权限组 {gid} 不存在")

        # 使用第一个权限组的名称作为role（向后兼容）
        first_group = deps.permission_group_store.get_group(group_ids[0])
        role_name = first_group['group_name'] if first_group else "viewer"

        user = deps.user_store.create_user(
            username=user_data.username,
            password=user_data.password,
            email=user_data.email,
            role=role_name,
            group_id=group_ids[0],  # 保留第一个权限组ID用于向后兼容
            status=user_data.status,
            created_by=payload.sub,
        )

        # 设置用户的权限组列表
        if group_ids:
            deps.user_store.set_user_permission_groups(user.user_id, group_ids)

        # 重新加载用户以获取权限组列表
        user = deps.user_store.get_by_user_id(user.user_id)

        # 构建权限组详情
        permission_groups = []
        for gid in user.group_ids:
            group = deps.permission_group_store.get_group(gid)
            if group:
                permission_groups.append({
                    'group_id': gid,
                    'group_name': group.get('group_name', ''),
                })

        return UserResponse(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
            group_id=user.group_id,  # 向后兼容
            group_ids=user.group_ids,
            permission_groups=permission_groups,
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

    # 构建权限组详情列表
    permission_groups = []
    if user.group_ids and len(user.group_ids) > 0:
        for gid in user.group_ids:
            pg = deps.permission_group_store.get_group(gid)
            if pg:
                permission_groups.append({
                    'group_id': gid,
                    'group_name': pg.get('group_name', ''),
                })

    return UserResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        group_id=user.group_id,
        group_name=group['group_name'] if group else None,
        group_ids=user.group_ids,  # 新字段
        permission_groups=permission_groups,  # 新字段
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
    # 支持多个权限组
    group_ids = user_data.group_ids
    role = None
    group_id = None

    # 优先使用 group_ids（新字段）
    if group_ids is not None:
        # 验证所有权限组存在
        for gid in group_ids:
            group = deps.permission_group_store.get_group(gid)
            if not group:
                raise HTTPException(status_code=400, detail=f"权限组 {gid} 不存在")

        # 使用第一个权限组作为主权限组（向后兼容）
        if len(group_ids) > 0:
            first_group = deps.permission_group_store.get_group(group_ids[0])
            role = first_group['group_name'] if first_group else None
            group_id = group_ids[0]
    elif user_data.group_id is not None:
        # 向后兼容：使用单个 group_id
        group = deps.permission_group_store.get_group(user_data.group_id)
        if not group:
            raise HTTPException(status_code=400, detail="权限组不存在")
        role = group['group_name']
        group_id = user_data.group_id
        group_ids = [group_id]

    user = deps.user_store.update_user(
        user_id=user_id,
        email=user_data.email,
        role=role,
        group_id=group_id,
        status=user_data.status,
    )
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 更新用户的权限组列表
    if group_ids is not None:
        deps.user_store.set_user_permission_groups(user.user_id, group_ids)

    # 重新加载用户以获取权限组列表
    user = deps.user_store.get_by_user_id(user.user_id)

    # 构建权限组详情
    permission_groups = []
    if user.group_ids and len(user.group_ids) > 0:
        for gid in user.group_ids:
            group = deps.permission_group_store.get_group(gid)
            if group:
                permission_groups.append({
                    'group_id': gid,
                    'group_name': group.get('group_name', ''),
                })

    return UserResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        group_id=user.group_id,  # 向后兼容
        group_ids=user.group_ids,  # 新字段
        permission_groups=permission_groups,  # 权限组详情
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
