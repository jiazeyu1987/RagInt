from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Annotated, Optional
import logging
from pydantic import BaseModel

from authx import TokenPayload
from core.security import auth
from dependencies import AppDependencies


router = APIRouter()
logger = logging.getLogger(__name__)


def get_deps(request: Request) -> AppDependencies:
    """Get dependencies from app state"""
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


class SearchRequest(BaseModel):
    """Search request model"""
    question: str
    dataset_ids: Optional[list[str]] = None
    page: int = 1
    page_size: int = 30
    similarity_threshold: float = 0.2
    top_k: int = 30
    keyword: bool = False
    highlight: bool = False


@router.post("/search")
async def search_chunks(
    request_data: SearchRequest,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    在知识库中检索文本块（chunks）

    权限规则：
    - 所有登录用户都可以使用检索功能
    - 用户只能检索自己有权限的知识库
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    logger.info(f"[SEARCH] User: {user.username}, question: {request_data.question[:50]}...")

    # 获取用户有权限的知识库
    if user.role == "admin":
        # 管理员可以使用所有知识库
        all_datasets = deps.ragflow_service.list_datasets()
        available_dataset_ids = [ds["id"] for ds in all_datasets]
    else:
        # 其他用户只能使用被授权的知识库
        from services.user_kb_permission_store import UserKbPermissionStore
        kb_permission_store = UserKbPermissionStore(db_path="new_backend/data/auth.db")
        available_dataset_ids = kb_permission_store.get_user_kbs(payload.sub)

    # 如果指定了dataset_ids，验证用户是否有权限
    if request_data.dataset_ids:
        valid_dataset_ids = [ds_id for ds_id in request_data.dataset_ids if ds_id in available_dataset_ids]
        if not valid_dataset_ids:
            raise HTTPException(status_code=403, detail="您没有权限访问指定的知识库")
        dataset_ids = valid_dataset_ids
    else:
        dataset_ids = available_dataset_ids

    if not dataset_ids:
        raise HTTPException(status_code=400, detail="没有可用的知识库进行检索")

    logger.info(f"[SEARCH] Using datasets: {dataset_ids}")

    # 调用检索服务
    try:
        result = deps.ragflow_chat_service.retrieve_chunks(
            question=request_data.question,
            dataset_ids=dataset_ids,
            page=request_data.page,
            page_size=request_data.page_size,
            similarity_threshold=request_data.similarity_threshold,
            top_k=request_data.top_k,
            keyword=request_data.keyword,
            highlight=request_data.highlight
        )

        logger.info(f"[SEARCH] Found {result.get('total', 0)} chunks")

        return result
    except Exception as e:
        logger.error(f"[SEARCH] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"检索失败: {str(e)}")


@router.get("/datasets")
async def list_available_datasets(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    获取用户可用的知识库列表

    权限规则：
    - 所有登录用户都可以访问
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 获取所有知识库从RAGFlow
    all_datasets = deps.ragflow_service.list_datasets()

    # 根据用户权限过滤
    if user.role == "admin":
        available_datasets = all_datasets
    else:
        from services.user_kb_permission_store import UserKbPermissionStore
        kb_permission_store = UserKbPermissionStore(db_path="new_backend/data/auth.db")
        user_dataset_ids = kb_permission_store.get_user_kbs(payload.sub)
        available_datasets = [ds for ds in all_datasets if ds["id"] in user_dataset_ids]

    return {
        "datasets": available_datasets,
        "count": len(available_datasets)
    }
