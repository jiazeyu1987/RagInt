"""
权限组管理API
提供权限组的CRUD接口，支持资源配置和细粒度权限
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional
import jwt

from config import settings
from dependencies import AppDependencies


def get_deps(request: Request) -> AppDependencies:
    """获取依赖项"""
    return request.app.state.deps


def get_current_user(request: Request, deps: AppDependencies = Depends(get_deps)):
    """手动验证JWT并获取当前用户（不使用AuthX的get_current_subject）"""
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

    if user.status != "active":
        raise HTTPException(status_code=403, detail="账户已被禁用")

    return user


class PermissionGroupCreate(BaseModel):
    group_name: str
    description: Optional[str] = ""
    accessible_kbs: Optional[List[str]] = []
    accessible_chats: Optional[List[str]] = []
    can_upload: bool = False
    can_review: bool = False
    can_download: bool = True
    can_delete: bool = False


class PermissionGroupUpdate(BaseModel):
    group_name: Optional[str] = None
    description: Optional[str] = None
    accessible_kbs: Optional[List[str]] = None
    accessible_chats: Optional[List[str]] = None
    can_upload: Optional[bool] = None
    can_review: Optional[bool] = None
    can_download: Optional[bool] = None
    can_delete: Optional[bool] = None


def create_router():
    """创建权限组API路由器"""
    router = APIRouter()

    @router.get("/permission-groups")
    async def list_permission_groups(
        current_user = Depends(get_current_user),
        deps: AppDependencies = Depends(get_deps)
    ):
        """列出所有权限组"""
        groups = deps.permission_group_store.list_groups()
        return {
            "ok": True,
            "data": groups
        }

    @router.get("/permission-groups/{group_id}")
    async def get_permission_group(
        group_id: int,
        current_user = Depends(get_current_user),
        deps: AppDependencies = Depends(get_deps)
    ):
        """获取单个权限组详情"""
        group = deps.permission_group_store.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="权限组不存在")

        return {
            "ok": True,
            "data": group
        }

    @router.post("/permission-groups")
    async def create_permission_group(
        data: PermissionGroupCreate,
        current_user = Depends(get_current_user),
        deps: AppDependencies = Depends(get_deps)
    ):
        """创建权限组"""
        group_id = deps.permission_group_store.create_group(
            group_name=data.group_name,
            description=data.description,
            accessible_kbs=data.accessible_kbs,
            accessible_chats=data.accessible_chats,
            can_upload=data.can_upload,
            can_review=data.can_review,
            can_download=data.can_download,
            can_delete=data.can_delete
        )

        if not group_id:
            raise HTTPException(status_code=400, detail="创建权限组失败，可能名称已存在")

        return {
            "ok": True,
            "data": {"group_id": group_id}
        }

    @router.put("/permission-groups/{group_id}")
    async def update_permission_group(
        group_id: int,
        data: PermissionGroupUpdate,
        current_user = Depends(get_current_user),
        deps: AppDependencies = Depends(get_deps)
    ):
        """更新权限组"""
        success = deps.permission_group_store.update_group(
            group_id=group_id,
            group_name=data.group_name,
            description=data.description,
            accessible_kbs=data.accessible_kbs,
            accessible_chats=data.accessible_chats,
            can_upload=data.can_upload,
            can_review=data.can_review,
            can_download=data.can_download,
            can_delete=data.can_delete
        )

        if not success:
            raise HTTPException(status_code=400, detail="更新权限组失败")

        return {
            "ok": True
        }

    @router.delete("/permission-groups/{group_id}")
    async def delete_permission_group(
        group_id: int,
        current_user = Depends(get_current_user),
        deps: AppDependencies = Depends(get_deps)
    ):
        """删除权限组"""
        success = deps.permission_group_store.delete_group(group_id)

        if not success:
            raise HTTPException(
                status_code=400,
                detail="删除权限组失败，可能是系统权限组或仍有用户使用"
            )

        return {
            "ok": True
        }

    @router.get("/permission-groups/resources/knowledge-bases")
    async def get_knowledge_bases(
        current_user = Depends(get_current_user),
        deps: AppDependencies = Depends(get_deps)
    ):
        """获取所有知识库列表（用于权限组配置）"""
        import logging
        logger = logging.getLogger(__name__)

        try:
            from services.ragflow_service import RagflowService
            ragflow = RagflowService()

            # 检查RAGFlow客户端是否初始化成功
            if not ragflow.client:
                logger.warning("RAGFlow client not initialized")
                return {
                    "ok": False,
                    "error": "RAGFlow服务未配置或连接失败",
                    "data": []
                }

            datasets = ragflow.list_datasets()

            # datasets返回的已经是列表格式
            if not isinstance(datasets, list):
                logger.error(f"Unexpected datasets format: {type(datasets)}")
                return {
                    "ok": False,
                    "error": "知识库数据格式错误",
                    "data": []
                }

            kb_list = [{"id": ds["name"], "name": ds["name"]} for ds in datasets if ds.get("name")]

            logger.info(f"Retrieved {len(kb_list)} knowledge bases")
            return {
                "ok": True,
                "data": kb_list
            }
        except Exception as e:
            logger.error(f"Failed to get knowledge bases: {e}", exc_info=True)
            return {
                "ok": False,
                "error": str(e),
                "data": []
            }

    @router.get("/permission-groups/resources/chats")
    async def get_chat_agents(
        current_user = Depends(get_current_user),
        deps: AppDependencies = Depends(get_deps)
    ):
        """获取所有聊天体列表（用于权限组配置）"""
        import logging
        logger = logging.getLogger(__name__)

        try:
            from services.ragflow_chat_service import RagflowChatService
            chat_service = RagflowChatService()

            chats = chat_service.list_chats()
            agents = chat_service.list_agents()

            chat_list = []
            for chat in chats:
                if chat.get('id') and chat.get('name'):
                    chat_list.append({"id": f"chat_{chat['id']}", "name": chat['name'], "type": "chat"})

            for agent in agents:
                if agent.get('id') and agent.get('name'):
                    chat_list.append({"id": f"agent_{agent['id']}", "name": agent['name'], "type": "agent"})

            logger.info(f"Retrieved {len(chat_list)} chat agents ({len(chats)} chats, {len(agents)} agents)")
            return {
                "ok": True,
                "data": chat_list
            }
        except Exception as e:
            logger.error(f"Failed to get chat agents: {e}", exc_info=True)
            return {
                "ok": False,
                "error": str(e),
                "data": []
            }

    return router
