from fastapi import APIRouter, Depends, HTTPException, Request, Body
from fastapi.responses import StreamingResponse
from typing import Annotated, Optional
import json
import logging
from pydantic import BaseModel

from authx import TokenPayload
from core.security import auth
from core.permissions import KbViewRequired
from dependencies import AppDependencies


router = APIRouter()
logger = logging.getLogger(__name__)


def get_deps(request: Request) -> AppDependencies:
    return request.app.state.deps


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


class ChatCompletionRequest(BaseModel):
    """Chat completion request model"""
    question: str
    stream: bool = True
    session_id: Optional[str] = None


class DeleteSessionsRequest(BaseModel):
    """Delete sessions request model"""
    ids: Optional[list[str]] = None


@router.get("/chats")
async def list_chats(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    page: int = 1,
    page_size: int = 30,
    orderby: str = "create_time",
    desc: bool = True,
    name: Optional[str] = None,
    chat_id: Optional[str] = None,
):
    """
    列出用户有权限访问的聊天助手

    权限规则：
    - 管理员：可以看到所有聊天助手
    - 其他角色：只能看到有权限的聊天助手
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 获取所有聊天助手
    all_chats = deps.ragflow_chat_service.list_chats(
        page=page,
        page_size=page_size,
        orderby=orderby,
        desc=desc,
        name=name,
        chat_id=chat_id
    )

    # 非管理员用户过滤
    if user.role != "admin":
        user_chat_ids = deps.user_chat_permission_store.get_user_chats(user.user_id)
        all_chats = [chat for chat in all_chats if chat.get("id") in user_chat_ids]

    return {
        "chats": all_chats,
        "count": len(all_chats)
    }


@router.get("/chats/my")
async def get_my_chats(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    获取当前用户有权限访问的聊天助手列表（返回完整的聊天助手信息）
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 获取所有聊天助手
    all_chats = deps.ragflow_chat_service.list_chats(page_size=1000)

    # 非管理员用户过滤
    if user.role != "admin":
        user_chat_ids = deps.user_chat_permission_store.get_user_chats(user.user_id)
        all_chats = [chat for chat in all_chats if chat.get("id") in user_chat_ids]

    return {
        "chats": all_chats,
        "count": len(all_chats)
    }


@router.get("/chats/{chat_id}")
async def get_chat(
    chat_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """获取单个聊天助手详情"""
    user = deps.user_store.get_by_user_id(payload.sub)

    # 检查权限
    if user.role != "admin":
        has_permission = deps.user_chat_permission_store.check_permission(user.user_id, chat_id)
        if not has_permission:
            raise HTTPException(status_code=403, detail="无权访问该聊天助手")

    chat = deps.ragflow_chat_service.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="聊天助手不存在")

    return chat


@router.post("/chats/{chat_id}/sessions")
async def create_session(
    chat_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    name: str = "新会话",
    user_id: Optional[str] = None,
):
    """
    创建聊天会话

    权限规则：
    - 用户必须有该聊天助手的权限
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 检查权限
    if user.role != "admin":
        has_permission = deps.user_chat_permission_store.check_permission(user.user_id, chat_id)
        if not has_permission:
            raise HTTPException(status_code=403, detail="无权访问该聊天助手")

    # 创建会话（使用当前用户的user_id）
    session = deps.ragflow_chat_service.create_session(
        chat_id=chat_id,
        name=name,
        user_id=user.user_id
    )

    if not session:
        raise HTTPException(status_code=500, detail="创建会话失败")

    return session


@router.get("/chats/{chat_id}/sessions")
async def list_sessions(
    chat_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    列出聊天助手的所有会话

    权限规则：
    - 用户必须有该聊天助手的权限
    - 只能看到自己的会话
    - 直接从 RAGFlow API 获取,包含完整的 messages 数据
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 检查权限
    if user.role != "admin":
        has_permission = deps.user_chat_permission_store.check_permission(user.user_id, chat_id)
        if not has_permission:
            raise HTTPException(status_code=403, detail="无权访问该聊天助手")

    # 从 RAGFlow API 获取当前用户的会话列表（包含 messages）
    sessions = deps.ragflow_chat_service.list_sessions(
        chat_id=chat_id,
        user_id=user.user_id
    )

    return {
        "sessions": sessions,
        "count": len(sessions)
    }


@router.post("/chats/{chat_id}/completions")
async def chat_completion(
    chat_id: str,
    request: Request,
    payload: AuthRequired,
    body: ChatCompletionRequest,
    deps: AppDependencies = Depends(get_deps),
):
    """
    与聊天助手对话（流式）

    权限规则：
    - 用户必须有该聊天助手的权限
    """
    logger.info(f"[CHAT] chat_id={chat_id}, question={body.question[:50]}..., session_id={body.session_id}")

    user = deps.user_store.get_by_user_id(payload.sub)

    # 检查权限
    if user.role != "admin":
        has_permission = deps.user_chat_permission_store.check_permission(user.user_id, chat_id)
        if not has_permission:
            logger.warning(f"[CHAT] User {user.username} has no permission for chat {chat_id}")
            raise HTTPException(status_code=403, detail="无权访问该聊天助手")

    if not body.question:
        logger.warning("[CHAT] Empty question received")
        raise HTTPException(status_code=400, detail="问题不能为空")

    async def generate():
        try:
            logger.info(f"[CHAT] Starting chat stream for session {body.session_id}")
            async for chunk in deps.ragflow_chat_service.chat(
                chat_id=chat_id,
                question=body.question,
                stream=body.stream,
                session_id=body.session_id,
                user_id=user.user_id
            ):
                # SSE格式
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"[CHAT] Error during chat: {e}", exc_info=True)
            error_chunk = {"code": -1, "message": str(e)}
            yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.delete("/chats/{chat_id}/sessions")
async def delete_sessions(
    chat_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    body: DeleteSessionsRequest = None,
):
    """
    删除聊天会话

    权限规则：
    - 用户必须有该聊天助手的权限
    - 只能删除自己的会话（管理员可以删除所有）
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # Extract session_ids from request body
    session_ids = body.ids if body else None

    # 检查权限
    if user.role != "admin":
        has_permission = deps.user_chat_permission_store.check_permission(user.user_id, chat_id)
        if not has_permission:
            raise HTTPException(status_code=403, detail="无权访问该聊天助手")

    # 非管理员用户：检查会话所有权
    if user.role != "admin" and session_ids:
        for session_id in session_ids:
            owns_session = deps.chat_session_store.check_ownership(
                session_id=session_id,
                chat_id=chat_id,
                user_id=user.user_id
            )
            if not owns_session:
                raise HTTPException(status_code=403, detail=f"无权删除会话 {session_id}")

    # 删除会话（RAGFlow + 本地数据库）
    success = deps.ragflow_chat_service.delete_sessions(
        chat_id=chat_id,
        session_ids=session_ids,
        user_id=user.user_id  # 传递给本地数据库标记删除者
    )

    if not success:
        raise HTTPException(status_code=500, detail="删除会话失败")

    return {"message": "会话已删除"}
