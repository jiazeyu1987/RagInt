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
    # Verify user credentials
    user = deps.user_store.get_by_username(credentials.username)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if hash_password(credentials.password) != user.password_hash:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if user.status != "active":
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

    # 获取权限组操作权限（如果有权限组）
    permissions = {
        'can_upload': False,
        'can_review': False,
        'can_download': False,
        'can_delete': False
    }

    if user.group_id:
        group = deps.permission_group_store.get_group(user.group_id)
        if group:
            permissions = {
                'can_upload': group.get('can_upload', False),
                'can_review': group.get('can_review', False),
                'can_download': group.get('can_download', False),
                'can_delete': group.get('can_delete', False)
            }

    return {
        "user_id": user.user_id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "group_id": user.group_id,
        "scopes": get_scopes_for_role(user.role),
        "permissions": permissions
    }
