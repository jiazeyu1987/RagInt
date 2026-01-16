from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.auth import AuthRequired, get_deps
from core.security import auth
from core.scopes import get_scopes_for_role
from dependencies import AppDependencies
from models.auth import LoginRequest, TokenResponse
from services.user_store import hash_password

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    response: Response,
    deps: AppDependencies = Depends(get_deps),
):
    user = deps.user_store.get_by_username(credentials.username)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if hash_password(credentials.password) != user.password_hash:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if user.status != "active":
        raise HTTPException(status_code=403, detail="账户已被禁用")

    scopes = get_scopes_for_role(user.role)

    access_token = auth.create_access_token(uid=user.user_id, scopes=scopes)
    refresh_token = auth.create_refresh_token(uid=user.user_id)
    auth.set_access_cookies(access_token, response)
    auth.set_refresh_cookies(refresh_token, response)

    deps.user_store.update_last_login(user.user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        scopes=scopes,
    )


@router.post("/refresh")
async def refresh_token(request: Request):
    try:
        refresh_token_value = await auth.get_refresh_token_from_request(request)
        payload = auth.verify_token(refresh_token_value, verify_type=True)

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
    auth.unset_cookies(response)
    return {"message": "登出成功"}


@router.get("/me")
async def get_current_user(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    permissions = {"can_upload": False, "can_review": False, "can_download": False, "can_delete": False}
    accessible_kbs_set: set[str] = set()
    accessible_chats_set: set[str] = set()
    permission_groups_list: list[dict] = []

    if user.group_ids and len(user.group_ids) > 0:
        for group_id in user.group_ids:
            group = deps.permission_group_store.get_group(group_id)
            if not group:
                continue

            permission_groups_list.append({"group_id": group_id, "group_name": group.get("group_name", "")})

            permissions["can_upload"] = permissions["can_upload"] or bool(group.get("can_upload", False))
            permissions["can_review"] = permissions["can_review"] or bool(group.get("can_review", False))
            permissions["can_download"] = permissions["can_download"] or bool(group.get("can_download", False))
            permissions["can_delete"] = permissions["can_delete"] or bool(group.get("can_delete", False))

            group_kbs = group.get("accessible_kbs", [])
            if group_kbs:
                accessible_kbs_set.update(group_kbs)

            group_chats = group.get("accessible_chats", [])
            if group_chats:
                accessible_chats_set.update(group_chats)

    return {
        "user_id": user.user_id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "group_id": user.group_id,
        "group_ids": user.group_ids,
        "permission_groups": permission_groups_list,
        "scopes": get_scopes_for_role(user.role),
        "permissions": permissions,
        "accessible_kbs": list(accessible_kbs_set),
        "accessible_chats": list(accessible_chats_set),
    }
