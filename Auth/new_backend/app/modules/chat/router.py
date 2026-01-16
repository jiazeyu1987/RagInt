from fastapi import APIRouter, Depends, HTTPException, Request, Body
from fastapi.responses import StreamingResponse
from typing import Optional
import json
import logging
from pydantic import BaseModel

from app.core.auth import AuthRequired, get_deps
from dependencies import AppDependencies


router = APIRouter()
logger = logging.getLogger(__name__)


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
    列出用户有权限访问的聊天助手（基于权限组）

    权限规则：
    - 管理员：可以看到所有聊天助手
    - 其他角色：根据权限组的accessible_chats配置
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

    # 非管理员用户根据权限组过滤
    if user.role != "admin":
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体，需要过滤
                    chat_id_set = set()
                    for cid in accessible_chats:
                        if cid.startswith('chat_'):
                            chat_id_set.add(cid[5:])  # 去掉 'chat_' 前缀
                        elif cid.startswith('agent_'):
                            chat_id_set.add(cid[6:])  # 去掉 'agent_' 前缀
                    all_chats = [chat for chat in all_chats if chat.get("id") in chat_id_set]
        # 如果权限组为空或没有权限组，返回所有（或者可以返回空列表，根据需求）

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
    获取当前用户有权限访问的聊天助手列表（基于权限组）
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 获取所有聊天助手和智能体
    all_chats = deps.ragflow_chat_service.list_chats(page_size=1000)
    all_agents = deps.ragflow_chat_service.list_agents(page_size=1000)

    # 获取用户的可访问聊天体列表（从权限组）
    if user.role == "admin":
        # 管理员可以看到所有
        accessible_chat_ids = []
    else:
        # 从权限组获取可访问的聊天体
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体
                    accessible_chat_ids = accessible_chats
                else:
                    # 权限组未指定（空数组），可以访问所有
                    accessible_chat_ids = []
            else:
                # 权限组不存在
                accessible_chat_ids = []
        else:
            # 用户没有分配权限组
            accessible_chat_ids = []

    # 如果有指定的聊天体ID列表，则过滤
    if accessible_chat_ids:
        # 将chat_xxx和agent_xxx转换为xxx
        chat_id_set = set()
        for cid in accessible_chat_ids:
            if cid.startswith('chat_'):
                chat_id_set.add(cid[5:])  # 去掉 'chat_' 前缀
            elif cid.startswith('agent_'):
                chat_id_set.add(cid[6:])  # 去掉 'agent_' 前缀

        # 过滤聊天助手和智能体
        filtered_chats = [chat for chat in all_chats if chat.get("id") in chat_id_set]
        filtered_agents = [agent for agent in all_agents if agent.get("id") in chat_id_set]

        # 添加type字段区分
        chats_with_type = []
        for chat in filtered_chats:
            chat['type'] = 'chat'
            chats_with_type.append(chat)
        for agent in filtered_agents:
            agent['type'] = 'agent'
            chats_with_type.append(agent)
    else:
        # 没有限制，返回所有
        chats_with_type = []
        for chat in all_chats:
            chat['type'] = 'chat'
            chats_with_type.append(chat)
        for agent in all_agents:
            agent['type'] = 'agent'
            chats_with_type.append(agent)

    return {
        "chats": chats_with_type,
        "count": len(chats_with_type)
    }


@router.get("/chats/{chat_id}")
async def get_chat(
    chat_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """获取单个聊天助手详情（基于权限组）"""
    user = deps.user_store.get_by_user_id(payload.sub)

    # 检查权限（基于权限组）
    if user.role != "admin":
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体，检查是否包含
                    if f"chat_{chat_id}" not in accessible_chats:
                        raise HTTPException(status_code=403, detail="无权访问该聊天助手")
            else:
                # 权限组不存在
                raise HTTPException(status_code=403, detail="无权访问该聊天助手")
        else:
            # 用户没有分配权限组
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

    # 检查权限（基于权限组）
    if user.role != "admin":
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体，检查是否包含
                    if f"chat_{chat_id}" not in accessible_chats:
                        raise HTTPException(status_code=403, detail="无权访问该聊天助手")
            else:
                # 权限组不存在
                raise HTTPException(status_code=403, detail="无权访问该聊天助手")
        else:
            # 用户没有分配权限组
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

    # 检查权限（基于权限组）
    if user.role != "admin":
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体，检查是否包含
                    if f"chat_{chat_id}" not in accessible_chats:
                        raise HTTPException(status_code=403, detail="无权访问该聊天助手")
            else:
                # 权限组不存在
                raise HTTPException(status_code=403, detail="无权访问该聊天助手")
        else:
            # 用户没有分配权限组
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

    # 检查权限（基于权限组）
    if user.role != "admin":
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体，检查是否包含
                    if f"chat_{chat_id}" not in accessible_chats:
                        logger.warning(f"[CHAT] User {user.username} has no permission for chat {chat_id}")
                        raise HTTPException(status_code=403, detail="无权访问该聊天助手")
            else:
                # 权限组不存在
                logger.warning(f"[CHAT] User {user.username} has no permission group")
                raise HTTPException(status_code=403, detail="无权访问该聊天助手")
        else:
            # 用户没有分配权限组
            logger.warning(f"[CHAT] User {user.username} has no permission group assigned")
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

    # 检查权限（基于权限组）
    if user.role != "admin":
        if user.group_id:
            group = deps.permission_group_store.get_group(user.group_id)
            if group:
                accessible_chats = group.get('accessible_chats', [])
                if accessible_chats and len(accessible_chats) > 0:
                    # 权限组指定了具体的聊天体，检查是否包含
                    if f"chat_{chat_id}" not in accessible_chats:
                        raise HTTPException(status_code=403, detail="无权访问该聊天助手")
            else:
                # 权限组不存在
                raise HTTPException(status_code=403, detail="无权访问该聊天助手")
        else:
            # 用户没有分配权限组
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
