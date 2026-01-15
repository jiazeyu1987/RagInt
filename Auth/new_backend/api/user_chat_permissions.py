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
class BatchGrantChatsRequest(BaseModel):
    user_ids: List[str]
    chat_ids: List[str]


class ChatListResponse(BaseModel):
    chat_ids: List[str]


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


@router.get("/users/{user_id}/chats", response_model=ChatListResponse)
async def get_user_chats(
    user_id: str,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    获取用户可访问的聊天助手列表（管理员）

    Args:
        user_id: 用户ID
        payload: 管理员token payload

    Returns:
        ChatListResponse: 聊天助手ID列表
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"[GET USER CHATS] Getting chats for user: {user_id}")

    # 验证用户是否存在
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        logger.error(f"[GET USER CHATS] User not found: {user_id}")
        raise HTTPException(status_code=404, detail="用户不存在")

    # 获取用户的聊天助手权限
    chat_ids = deps.user_chat_permission_store.get_user_chats(user_id)

    logger.info(f"[GET USER CHATS] User {user.username} has {len(chat_ids)} chat permissions: {chat_ids}")

    return ChatListResponse(chat_ids=chat_ids)


@router.post("/users/{user_id}/chats/{chat_id}", status_code=201)
async def grant_chat_access(
    user_id: str,
    chat_id: str,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    授予用户聊天助手访问权限（管理员）

    Args:
        user_id: 用户ID
        chat_id: 聊天助手ID
        payload: 管理员token payload

    Returns:
        成功消息
    """
    # 验证用户是否存在
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 授予权限
    deps.user_chat_permission_store.grant_permission(
        user_id=user_id,
        chat_id=chat_id,
        granted_by=payload.sub
    )

    return {"message": f"已授予用户 {user.username} 访问聊天助手 '{chat_id}' 的权限"}


@router.delete("/users/{user_id}/chats/{chat_id}")
async def revoke_chat_access(
    user_id: str,
    chat_id: str,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    撤销用户聊天助手访问权限（管理员）

    Args:
        user_id: 用户ID
        chat_id: 聊天助手ID
        payload: 管理员token payload

    Returns:
        成功消息
    """
    # 验证用户是否存在
    user = deps.user_store.get_by_user_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 撤销权限
    success = deps.user_chat_permission_store.revoke_permission(
        user_id=user_id,
        chat_id=chat_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="权限不存在")

    return {"message": f"已撤销用户 {user.username} 访问聊天助手 '{chat_id}' 的权限"}


@router.get("/me/chats", response_model=ChatListResponse)
async def get_my_chats(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    获取当前用户可访问的聊天助手列表（基于权限组）

    Args:
        payload: 当前用户token payload

    Returns:
        ChatListResponse: 聊天助手ID列表
    """
    import logging
    logger = logging.getLogger(__name__)

    # 获取当前用户
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员自动拥有所有权限
    if user.role == "admin":
        try:
            # 从RAGFlow获取所有聊天助手和智能体
            all_chats = deps.ragflow_chat_service.list_chats(page_size=1000)
            all_agents = deps.ragflow_chat_service.list_agents(page_size=1000)
            chat_ids = []
            for chat in all_chats:
                if chat.get("id"):
                    chat_ids.append(f"chat_{chat['id']}")
            for agent in all_agents:
                if agent.get("id"):
                    chat_ids.append(f"agent_{agent['id']}")
        except Exception as e:
            logger.error(f"Failed to get all chats/agents: {e}")
            chat_ids = []
    else:
        # 其他用户从权限组获取权限
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                # 获取权限组配置的可访问聊天体
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体
                    chat_ids = accessible_chats
                else:
                    # 权限组未指定（空数组），则可以访问所有
                    try:
                        all_chats = deps.ragflow_chat_service.list_chats(page_size=1000)
                        all_agents = deps.ragflow_chat_service.list_agents(page_size=1000)
                        chat_ids = []
                        for chat in all_chats:
                            if chat.get("id"):
                                chat_ids.append(f"chat_{chat['id']}")
                        for agent in all_agents:
                            if agent.get("id"):
                                chat_ids.append(f"agent_{agent['id']}")
                    except Exception as e:
                        logger.error(f"Failed to get all chats/agents: {e}")
                        chat_ids = []
            else:
                # 权限组不存在
                chat_ids = []
        else:
            # 用户没有分配权限组
            chat_ids = []

    logger.info(f"User {user.username} (group_id={user.group_id}) has {len(chat_ids)} accessible chats")
    return ChatListResponse(chat_ids=chat_ids)


@router.post("/users/batch-grant-chats")
async def batch_grant_chats(
    request_data: BatchGrantChatsRequest,
    payload: AdminRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    批量授予多个用户多个聊天助手的权限（管理员）
    注意：此操作会先删除用户所有现有的聊天助手权限，然后授予新权限

    Args:
        request_data: 包含user_ids列表和chat_ids列表
        payload: 管理员token payload

    Returns:
        成功消息和统计信息
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"[BATCH GRANT CHATS] Request from user: {payload.sub}")
    logger.info(f"[BATCH GRANT CHATS] user_ids: {request_data.user_ids}")
    logger.info(f"[BATCH GRANT CHATS] chat_ids: {request_data.chat_ids}")

    # 验证用户是否存在
    valid_user_ids = []
    for user_id in request_data.user_ids:
        user = deps.user_store.get_by_user_id(user_id)
        if user:
            valid_user_ids.append(user_id)
            logger.info(f"[BATCH GRANT CHATS] Found user: {user.username} ({user.user_id})")
        else:
            logger.error(f"[BATCH GRANT CHATS] User not found: {user_id}")
            raise HTTPException(status_code=404, detail=f"用户 {user_id} 不存在")

    # 先删除所有现有的聊天助手权限
    logger.info(f"[BATCH GRANT CHATS] Revoking all existing chat permissions...")
    revoked_count = 0
    for user_id in valid_user_ids:
        count = deps.user_chat_permission_store.revoke_all_user_permissions(user_id)
        revoked_count += count
        logger.info(f"[BATCH GRANT CHATS] Revoked {count} permissions for user {user_id}")

    # 批量授予新权限
    logger.info(f"[BATCH GRANT CHATS] Granting new permissions...")
    count = deps.user_chat_permission_store.grant_batch_permissions(
        user_ids=valid_user_ids,
        chat_ids=request_data.chat_ids,
        granted_by=payload.sub
    )

    logger.info(f"[BATCH GRANT CHATS] Granted {count} permissions")

    return {
        "message": f"已为 {len(valid_user_ids)} 个用户配置 {len(request_data.chat_ids)} 个聊天助手的权限（删除了 {revoked_count} 个旧权限）",
        "total_permissions": count,
        "revoked_permissions": revoked_count
    }
