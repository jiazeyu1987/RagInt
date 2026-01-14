from fastapi import APIRouter, Depends, HTTPException, Request, Body
from typing import Annotated, List
from pydantic import BaseModel

from authx import TokenPayload
from core.security import auth
from core.permissions import AdminRequired
from dependencies import AppDependencies


router = APIRouter()


def get_deps(request: Request) -> AppDependencies:
    """Get dependencies from app state"""
    return request.app.state.deps


# Pydantic models for request/response
class BatchGrantRequest(BaseModel):
    user_ids: List[str]
    kb_ids: List[str]


class KbListResponse(BaseModel):
    kb_ids: List[str]


def get_current_payload(request: Request) -> TokenPayload:
    """
    Get current user token payload (no special permissions required)
    Similar to auth.get_payload() but without scope checking
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header.split(" ")[1]

    # Use AuthX's internal token verification
    payload = auth._decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    return payload


# Authenticated user dependency (no special permissions required)
AuthRequired = Annotated[TokenPayload, Depends(get_current_payload)]


@router.get("/users/{user_id}/kbs", response_model=KbListResponse)
async def get_user_knowledge_bases(
    user_id: str,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    获取用户可访问的知识库列表（管理员）

    Args:
        user_id: 用户ID
        payload: 管理员token payload

    Returns:
        KbListResponse: 知识库ID列表
    """
    # 验证用户是否存在
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 获取用户的知识库权限
    kb_ids = deps.user_kb_permission_store.get_user_kbs(user_id)

    return KbListResponse(kb_ids=kb_ids)


@router.post("/users/{user_id}/kbs/{kb_id}", status_code=201)
async def grant_knowledge_base_access(
    user_id: str,
    kb_id: str,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    授予用户知识库访问权限（管理员）

    Args:
        user_id: 用户ID
        kb_id: 知识库ID
        payload: 管理员token payload

    Returns:
        成功消息
    """
    # 验证用户是否存在
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 授予权限
    deps.user_kb_permission_store.grant_permission(
        user_id=user_id,
        kb_id=kb_id,
        granted_by=payload.sub
    )

    return {"message": f"已授予用户 {user.username} 访问知识库 '{kb_id}' 的权限"}


@router.delete("/users/{user_id}/kbs/{kb_id}")
async def revoke_knowledge_base_access(
    user_id: str,
    kb_id: str,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    撤销用户知识库访问权限（管理员）

    Args:
        user_id: 用户ID
        kb_id: 知识库ID
        payload: 管理员token payload

    Returns:
        成功消息
    """
    # 验证用户是否存在
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 撤销权限
    success = deps.user_kb_permission_store.revoke_permission(
        user_id=user_id,
        kb_id=kb_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="权限不存在")

    return {"message": f"已撤销用户 {user.username} 访问知识库 '{kb_id}' 的权限"}


@router.get("/me/kbs", response_model=KbListResponse)
async def get_my_knowledge_bases(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    获取当前用户可访问的知识库列表

    Args:
        payload: 当前用户token payload

    Returns:
        KbListResponse: 知识库ID列表
    """
    # 获取当前用户
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员自动拥有所有权限（特殊处理）
    if user.role == "admin":
        try:
            # 从RAGFlow获取所有知识库
            datasets = deps.ragflow_service.list_datasets()
            kb_ids = [ds['name'] for ds in datasets] if datasets else ["展厅"]
        except Exception:
            # 如果RAGFlow连接失败，返回默认知识库
            kb_ids = ["展厅"]
    else:
        # 其他用户从数据库获取权限
        kb_ids = deps.user_kb_permission_store.get_user_kbs(payload.sub)

    return KbListResponse(kb_ids=kb_ids)


@router.post("/users/batch-grant")
async def batch_grant_knowledge_bases(
    request_data: BatchGrantRequest,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    批量授予多个用户多个知识库的权限（管理员）

    Args:
        request_data: 包含user_ids列表和kb_ids列表
        payload: 管理员token payload

    Returns:
        成功消息和统计信息
    """
    # 验证用户是否存在
    valid_user_ids = []
    for user_id in request_data.user_ids:
        user = deps.user_store.get_by_user_id(user_id)
        if user:
            valid_user_ids.append(user_id)
        else:
            raise HTTPException(status_code=404, detail=f"用户 {user_id} 不存在")

    # 批量授予权限
    count = deps.user_kb_permission_store.grant_batch_permissions(
        user_ids=valid_user_ids,
        kb_ids=request_data.kb_ids,
        granted_by=payload.sub
    )

    return {
        "message": f"已为 {len(valid_user_ids)} 个用户授予 {len(request_data.kb_ids)} 个知识库的权限",
        "total_permissions": count
    }
