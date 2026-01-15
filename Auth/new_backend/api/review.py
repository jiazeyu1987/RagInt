from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Annotated, Optional
from pathlib import Path

from authx import TokenPayload
from core.security import auth
from models.document import DocumentResponse, DocumentReviewRequest
from dependencies import AppDependencies


router = APIRouter()


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


@router.post("/documents/{doc_id}/approve", response_model=DocumentResponse)
async def approve_document(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    review_data: DocumentReviewRequest = None,
):
    """
    审核通过文档并上传到RAGFlow（基于权限组检查审核权限）
    """
    import logging
    logger = logging.getLogger(__name__)

    # 获取用户并检查审核权限
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员可以直接审核
    if user.role != "admin":
        # 非管理员需要检查权限组的 can_review 权限
        if not user.group_id:
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

        group = deps.permission_group_store.get_group(user.group_id)
        if not group or not group.get('can_review', 0):
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

    logger.info(f"[APPROVE] User {user.username} approving doc {doc_id}")

    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        logger.error(f"[APPROVE] Document not found: {doc_id}")
        raise HTTPException(status_code=404, detail="文档不存在")

    logger.info(f"[APPROVE] Document found: filename={doc.filename}, kb_id={doc.kb_id}, status={doc.status}")

    if doc.status != "pending":
        logger.error(f"[APPROVE] Document status is not pending: {doc.status}")
        raise HTTPException(status_code=400, detail="文档不是待审核状态")

    try:
        # 上传到RAGFlow
        logger.info(f"[APPROVE] Starting upload to RAGFlow...")
        logger.info(f"[APPROVE] Local file path: {doc.file_path}")

        # 从本地文件读取并上传到RAGFlow
        if not Path(doc.file_path).exists():
            logger.error(f"[APPROVE] Local file not found: {doc.file_path}")
            raise HTTPException(status_code=404, detail="本地文件不存在")

        with open(doc.file_path, "rb") as f:
            file_content = f.read()

        logger.info(f"[APPROVE] File read successfully, size={len(file_content)} bytes")
        logger.info(f"[APPROVE] Uploading to RAGFlow kb={doc.kb_id}...")

        ragflow_doc_id = deps.ragflow_service.upload_document_blob(
            file_filename=doc.filename,
            file_content=file_content,
            kb_id=doc.kb_id
        )

        if not ragflow_doc_id:
            logger.error(f"[APPROVE] RAGFlow upload failed, ragflow_doc_id is None")
            raise HTTPException(status_code=500, detail="上传到RAGFlow失败")

        logger.info(f"[APPROVE] RAGFlow upload successful, ragflow_doc_id={ragflow_doc_id}")

        # 更新状态为approved，记录审核者
        updated_doc = deps.kb_store.update_document_status(
            doc_id=doc_id,
            status="approved",
            reviewed_by=payload.sub,
            review_notes=review_data.review_notes if review_data else None,
            ragflow_doc_id=ragflow_doc_id,
        )

        logger.info(f"[APPROVE] Document approved successfully")
        logger.info(f"[APPROVE] doc_id={doc_id}, reviewed_by={payload.sub}")
        logger.info(f"[APPROVE] New status=approved, ragflow_doc_id={ragflow_doc_id}")
        logger.info("=" * 80)

        return DocumentResponse(
            doc_id=updated_doc.doc_id,
            filename=updated_doc.filename,
            file_size=updated_doc.file_size,
            mime_type=updated_doc.mime_type,
            uploaded_by=updated_doc.uploaded_by,
            status=updated_doc.status,
            uploaded_at_ms=updated_doc.uploaded_at_ms,
            reviewed_by=updated_doc.reviewed_by,
            reviewed_at_ms=updated_doc.reviewed_at_ms,
            review_notes=updated_doc.review_notes,
            ragflow_doc_id=updated_doc.ragflow_doc_id,
            kb_id=updated_doc.kb_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[APPROVE] Exception during approval: {e}")
        raise HTTPException(status_code=500, detail=f"审核失败: {str(e)}")


@router.post("/documents/{doc_id}/reject", response_model=DocumentResponse)
async def reject_document(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    review_data: DocumentReviewRequest = None,
):
    """
    拒绝文档（基于权限组检查审核权限）
    """
    # 获取用户并检查审核权限
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员可以直接审核
    if user.role != "admin":
        # 非管理员需要检查权限组的 can_review 权限
        if not user.group_id:
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

        group = deps.permission_group_store.get_group(user.group_id)
        if not group or not group.get('can_review', 0):
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[REJECT] User {user.username} rejecting doc {doc_id}")

    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.status != "pending":
        raise HTTPException(status_code=400, detail="文档不是待审核状态")

    updated_doc = deps.kb_store.update_document_status(
        doc_id=doc_id,
        status="rejected",
        reviewed_by=payload.sub,
        review_notes=review_data.review_notes if review_data else None,
    )

    return DocumentResponse(
        doc_id=updated_doc.doc_id,
        filename=updated_doc.filename,
        file_size=updated_doc.file_size,
        mime_type=updated_doc.mime_type,
        uploaded_by=updated_doc.uploaded_by,
        status=updated_doc.status,
        uploaded_at_ms=updated_doc.uploaded_at_ms,
        reviewed_by=updated_doc.reviewed_by,
        reviewed_at_ms=updated_doc.reviewed_at_ms,
        review_notes=updated_doc.review_notes,
        ragflow_doc_id=updated_doc.ragflow_doc_id,
        kb_id=updated_doc.kb_id,
    )
