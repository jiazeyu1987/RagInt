from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import AuthRequired, get_deps
from core.permissions import AdminRequired
from dependencies import AppDependencies

from app.modules.user_kb_permissions.repo import UserKbPermissionsRepo
from app.modules.user_kb_permissions.schemas import BatchGrantRequest, KbListResponse
from app.modules.user_kb_permissions.service import UserKbPermissionsService


router = APIRouter()


def get_service(deps: AppDependencies = Depends(get_deps)) -> UserKbPermissionsService:
    return UserKbPermissionsService(UserKbPermissionsRepo(deps))


@router.get("/users/{user_id}/kbs", response_model=KbListResponse)
async def get_user_knowledge_bases(
    user_id: str,
    _: AdminRequired,
    service: UserKbPermissionsService = Depends(get_service),
):
    kb_ids = service.get_user_knowledge_bases_admin(user_id)
    return KbListResponse(kb_ids=kb_ids)


@router.post("/users/{user_id}/kbs/{kb_id}", status_code=201)
async def grant_knowledge_base_access(
    user_id: str,
    kb_id: str,
    payload: AdminRequired,
    service: UserKbPermissionsService = Depends(get_service),
):
    username = service.grant_access_admin(user_id=user_id, kb_id=kb_id, granted_by=payload.sub)
    return {"message": f"已授予用户 {username} 访问知识库 '{kb_id}' 的权限"}


@router.delete("/users/{user_id}/kbs/{kb_id}")
async def revoke_knowledge_base_access(
    user_id: str,
    kb_id: str,
    _: AdminRequired,
    service: UserKbPermissionsService = Depends(get_service),
):
    username = service.revoke_access_admin(user_id=user_id, kb_id=kb_id)
    return {"message": f"已撤销用户 {username} 访问知识库 '{kb_id}' 的权限"}


@router.get("/me/kbs", response_model=KbListResponse)
async def get_my_knowledge_bases(
    payload: AuthRequired,
    service: UserKbPermissionsService = Depends(get_service),
):
    kb_ids = service.get_my_knowledge_bases(payload.sub)
    return KbListResponse(kb_ids=kb_ids)


@router.post("/users/batch-grant")
async def batch_grant_knowledge_bases(
    request_data: BatchGrantRequest,
    payload: AdminRequired,
    service: UserKbPermissionsService = Depends(get_service),
):
    count = service.batch_grant_admin(user_ids=request_data.user_ids, kb_ids=request_data.kb_ids, granted_by=payload.sub)
    return {
        "message": f"已为 {len(request_data.user_ids)} 个用户授予 {len(request_data.kb_ids)} 个知识库的权限",
        "total_permissions": count,
    }

