from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import AuthRequired, get_deps
from dependencies import AppDependencies

from app.modules.permission_groups.schemas import PermissionGroupCreate, PermissionGroupUpdate
from app.modules.permission_groups.service import PermissionGroupsService

logger = logging.getLogger(__name__)


def get_service(deps: AppDependencies = Depends(get_deps)) -> PermissionGroupsService:
    return PermissionGroupsService(deps)


def create_router() -> APIRouter:
    router = APIRouter()

    @router.get("/permission-groups")
    async def list_permission_groups(
        _: AuthRequired,
        service: PermissionGroupsService = Depends(get_service),
    ):
        groups = service.list_groups()
        return {"ok": True, "data": groups}

    @router.get("/permission-groups/{group_id}")
    async def get_permission_group(
        group_id: int,
        _: AuthRequired,
        service: PermissionGroupsService = Depends(get_service),
    ):
        group = service.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Permission group not found")
        return {"ok": True, "data": group}

    @router.post("/permission-groups")
    async def create_permission_group(
        data: PermissionGroupCreate,
        _: AuthRequired,
        service: PermissionGroupsService = Depends(get_service),
    ):
        payload = data.model_dump()
        group_id = service.create_group(payload)
        if not group_id:
            raise HTTPException(status_code=400, detail="Failed to create permission group")
        return {"ok": True, "data": {"group_id": group_id}}

    @router.put("/permission-groups/{group_id}")
    async def update_permission_group(
        group_id: int,
        data: PermissionGroupUpdate,
        _: AuthRequired,
        service: PermissionGroupsService = Depends(get_service),
    ):
        payload = {k: v for k, v in data.model_dump().items() if v is not None}
        success = service.update_group(group_id, payload)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to update permission group")
        return {"ok": True}

    @router.delete("/permission-groups/{group_id}")
    async def delete_permission_group(
        group_id: int,
        _: AuthRequired,
        service: PermissionGroupsService = Depends(get_service),
    ):
        success = service.delete_group(group_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to delete permission group")
        return {"ok": True}

    @router.get("/permission-groups/resources/knowledge-bases")
    async def get_knowledge_bases(
        _: AuthRequired,
        deps: AppDependencies = Depends(get_deps),
        service: PermissionGroupsService = Depends(get_service),
    ):
        if not getattr(deps.ragflow_service, "client", None):
            return {"ok": False, "error": "RAGFlow client not initialized", "data": []}
        try:
            kb_list = service.list_knowledge_bases()
            return {"ok": True, "data": kb_list}
        except Exception as e:
            logger.error("Failed to get knowledge bases: %s", e, exc_info=True)
            return {"ok": False, "error": str(e), "data": []}

    @router.get("/permission-groups/resources/chats")
    async def get_chat_agents(
        _: AuthRequired,
        service: PermissionGroupsService = Depends(get_service),
    ):
        try:
            chat_list = service.list_chat_agents()
            return {"ok": True, "data": chat_list}
        except Exception as e:
            logger.error("Failed to get chat agents: %s", e, exc_info=True)
            return {"ok": False, "error": str(e), "data": []}

    return router
