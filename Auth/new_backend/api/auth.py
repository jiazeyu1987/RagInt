from fastapi import APIRouter, Depends, HTTPException, Request, Response
from typing import Annotated
import jwt

from authx import TokenPayload
from core.security import auth
from core.scopes import get_scopes_for_role
from models.auth import LoginRequest, TokenResponse
from services.user_store import UserStore, hash_password
from dependencies import AppDependencies
from config import settings


router = APIRouter()


def get_deps(request: Request) -> AppDependencies:
    """Get dependencies from app state"""
    return request.app.state.deps


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    response: Response,
    deps: AppDependencies = Depends(get_deps),
):
    """
    User login

    Returns access_token and refresh_token.
    Tokens are set in cookies and response body.
    """
    print(f"[DEBUG] Login attempt for username: {credentials.username}")

    # Verify user credentials
    user = deps.user_store.get_by_username(credentials.username)
    if not user:
        print(f"[DEBUG] User not found: {credentials.username}")
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    print(f"[DEBUG] User found: {user.username}, status: {user.status}")

    if hash_password(credentials.password) != user.password_hash:
        print(f"[DEBUG] Password mismatch for: {credentials.username}")
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if user.status != "active":
        print(f"[DEBUG] User not active: {user.username}, status: {user.status}")
        raise HTTPException(status_code=403, detail="账户已被禁用")

    # Get scopes based on user's role
    scopes = get_scopes_for_role(user.role)

    # Create access and refresh tokens
    access_token = auth.create_access_token(
        uid=user.user_id,
        scopes=scopes
    )
    refresh_token = auth.create_refresh_token(uid=user.user_id)

    # Set cookies
    auth.set_access_cookies(access_token, response)
    auth.set_refresh_cookies(refresh_token, response)

    # Update last login
    deps.user_store.update_last_login(user.user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        scopes=scopes,
    )


@router.post("/refresh")
async def refresh_token(request: Request):
    """
    Refresh access token using refresh token
    """
    try:
        # Get refresh token from request
        refresh_token = await auth.get_refresh_token_from_request(request)

        # Verify refresh token
        payload = auth.verify_token(refresh_token, verify_type=True)

        # Get user's role and scopes
        deps = request.app.state.deps
        user = deps.user_store.get_by_user_id(payload.sub)
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")

        if user.status != "active":
            raise HTTPException(status_code=403, detail="账户已被禁用")

        scopes = get_scopes_for_role(user.role)
        access_token = auth.create_access_token(uid=payload.sub, scopes=scopes)

        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"刷新令牌无效: {str(e)}")


@router.post("/logout")
async def logout(response: Response):
    """
    Logout by clearing cookies
    """
    auth.unset_cookies(response)
    return {"message": "登出成功"}


@router.get("/me")
async def get_current_user(
    request: Request,
    deps: AppDependencies = Depends(get_deps),
):
    """
    Get current user info
    """
    # Get token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header.split(" ")[1]

    # Decode JWT token manually
    try:
        decoded = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Get user_id from token subject
    user_id = decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 获取所有权限组的操作权限（取并集）
    permissions = {
        'can_upload': False,
        'can_review': False,
        'can_download': False,
        'can_delete': False
    }

    # 收集所有权限组的资源权限（知识库和聊天体）
    accessible_kbs_set = set()
    accessible_chats_set = set()
    permission_groups_list = []

    if user.group_ids and len(user.group_ids) > 0:
        for group_id in user.group_ids:
            group = deps.permission_group_store.get_group(group_id)
            if group:
                permission_groups_list.append({
                    'group_id': group_id,
                    'group_name': group.get('group_name', ''),
                })

                # 合并操作权限（取并集：任一为true则为true）
                permissions['can_upload'] = permissions['can_upload'] or group.get('can_upload', False)
                permissions['can_review'] = permissions['can_review'] or group.get('can_review', False)
                permissions['can_download'] = permissions['can_download'] or group.get('can_download', False)
                permissions['can_delete'] = permissions['can_delete'] or group.get('can_delete', False)

                # 合并资源权限（取并集）
                group_kbs = group.get('accessible_kbs', [])
                if group_kbs:
                    accessible_kbs_set.update(group_kbs)

                group_chats = group.get('accessible_chats', [])
                if group_chats:
                    accessible_chats_set.update(group_chats)

    # 转换为列表
    accessible_kbs = list(accessible_kbs_set)
    accessible_chats = list(accessible_chats_set)

    return {
        "user_id": user.user_id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "group_id": user.group_id,  # 保留用于向后兼容
        "group_ids": user.group_ids,  # 新字段
        "permission_groups": permission_groups_list,  # 权限组详情
        "scopes": get_scopes_for_role(user.role),
        "permissions": permissions,
        "accessible_kbs": accessible_kbs,
        "accessible_chats": accessible_chats
    }
