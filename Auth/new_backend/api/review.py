from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Annotated, Optional
from pathlib import Path

from authx import TokenPayload
from core.security import auth
from core.permissions import KbApproveRequired, KbRejectRequired
from models.document import DocumentResponse, DocumentReviewRequest
from dependencies import AppDependencies


router = APIRouter()


def get_deps(request: Request) -> AppDependencies:
    return request.app.state.deps


@router.post("/documents/{doc_id}/approve", response_model=DocumentResponse)
async def approve_document(
    doc_id: str,
    payload: KbApproveRequired,
    deps: AppDependencies = Depends(get_deps),
    review_data: DocumentReviewRequest = None,
):
    """
    审核通过文档并上传到RAGFlow

    新流程：
    1. 检查审核者是否有该知识库权限（管理员自动通过）
    2. 检查文档状态是否为pending
    3. 从本地读取文件并上传到RAGFlow
    4. 更新文档状态为approved，记录审核者
    """
    import logging
    logger = logging.getLogger(__name__)

    # ========== REVIEW STEP 1: Review Request ==========
    logger.info("=" * 80)
    logger.info("BACKEND: Document approve request received")
    logger.info(f"BACKEND: doc_id={doc_id}, reviewer={payload.sub}")

    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        logger.error(f"BACKEND: Document not found: {doc_id}")
        raise HTTPException(status_code=404, detail="文档不存在")

    logger.info(f"BACKEND: Document found: filename={doc.filename}, kb_id={doc.kb_id}, status={doc.status}")

    # 检查审核者是否有该知识库权限
    user = deps.user_store.get_by_user_id(payload.sub)
    logger.info(f"BACKEND: Reviewer: username={user.username}, role={user.role}")

    if user.role != "admin":
        user_kbs = deps.user_kb_permission_store.get_user_kbs(payload.sub)
        logger.info(f"BACKEND: Reviewer's KB permissions: {user_kbs}")

        has_permission = deps.user_kb_permission_store.check_permission(payload.sub, doc.kb_id)
        logger.info(f"BACKEND: Permission check result for kb '{doc.kb_id}': {has_permission}")

        if not has_permission:
            logger.warning(f"BACKEND: Reviewer does not have permission for kb '{doc.kb_id}'")
            raise HTTPException(status_code=403, detail="无权审核该知识库文档")

    if doc.status != "pending":
        logger.error(f"BACKEND: Document status is not pending: {doc.status}")
        raise HTTPException(status_code=400, detail="文档不是待审核状态")

    try:
        # ========== REVIEW STEP 2: Upload to RAGFlow ==========
        logger.info(f"BACKEND: Starting upload to RAGFlow...")
        logger.info(f"BACKEND: Local file path: {doc.file_path}")

        # 从本地文件读取并上传到RAGFlow（这里才真正上传）
        if not Path(doc.file_path).exists():
            logger.error(f"BACKEND: Local file not found: {doc.file_path}")
            raise HTTPException(status_code=404, detail="本地文件不存在")

        with open(doc.file_path, "rb") as f:
            file_content = f.read()

        logger.info(f"BACKEND: File read successfully, size={len(file_content)} bytes")
        logger.info(f"BACKEND: Uploading to RAGFlow kb={doc.kb_id}...")

        ragflow_doc_id = deps.ragflow_service.upload_document_blob(
            file_filename=doc.filename,
            file_content=file_content,
            kb_id=doc.kb_id
        )

        if not ragflow_doc_id:
            logger.error(f"BACKEND: RAGFlow upload failed, ragflow_doc_id is None")
            raise HTTPException(status_code=500, detail="上传到RAGFlow失败")

        logger.info(f"BACKEND: RAGFlow upload successful, ragflow_doc_id={ragflow_doc_id}")

        # 更新状态为approved，记录审核者
        updated_doc = deps.kb_store.update_document_status(
            doc_id=doc_id,
            status="approved",
            reviewed_by=payload.sub,
            review_notes=review_data.review_notes if review_data else None,
            ragflow_doc_id=ragflow_doc_id,
        )

        # ========== REVIEW STEP 3: Approval Complete ==========
        logger.info(f"BACKEND: Document approved successfully")
        logger.info(f"BACKEND: doc_id={doc_id}, reviewed_by={payload.sub}")
        logger.info(f"BACKEND: New status=approved, ragflow_doc_id={ragflow_doc_id}")
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
        logger.exception(f"BACKEND: Exception during approval: {e}")
        raise HTTPException(status_code=500, detail=f"审核失败: {str(e)}")


@router.post("/documents/{doc_id}/reject", response_model=DocumentResponse)
async def reject_document(
    doc_id: str,
    payload: KbRejectRequired,
    deps: AppDependencies = Depends(get_deps),
    review_data: DocumentReviewRequest = None,
):
    """
    拒绝文档

    拒绝的文档状态变为rejected，不上传到RAGFlow
    操作员可以重新上传（创建新的文档记录）
    """
    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.status != "pending":
        raise HTTPException(status_code=400, detail="文档不是待审核状态")

    # 检查审核者是否有该知识库权限
    user = deps.user_store.get_by_user_id(payload.sub)
    if user.role != "admin":
        if not deps.user_kb_permission_store.check_permission(payload.sub, doc.kb_id):
            raise HTTPException(status_code=403, detail="无权审核该知识库文档")

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
