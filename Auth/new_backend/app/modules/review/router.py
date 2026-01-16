from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path

from app.core.auth import AuthRequired, get_deps
from dependencies import AppDependencies
from models.document import DocumentResponse, DocumentReviewRequest


router = APIRouter()


@router.post("/documents/{doc_id}/approve", response_model=DocumentResponse)
async def approve_document(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    review_data: DocumentReviewRequest = None,
):
    import logging
    logger = logging.getLogger(__name__)

    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.role != "admin":
        if not user.group_id:
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

        group = deps.permission_group_store.get_group(user.group_id)
        if not group or not group.get("can_review", 0):
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

    logger.info(f"[APPROVE] User {user.username} approving doc {doc_id}")

    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        logger.error(f"[APPROVE] Document not found: {doc_id}")
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.status != "pending":
        logger.error(f"[APPROVE] Document status is not pending: {doc.status}")
        raise HTTPException(status_code=400, detail="文档不是待审核状态")

    try:
        if not Path(doc.file_path).exists():
            logger.error(f"[APPROVE] Local file not found: {doc.file_path}")
            raise HTTPException(status_code=404, detail="本地文件不存在")

        with open(doc.file_path, "rb") as f:
            file_content = f.read()

        ragflow_doc_id = deps.ragflow_service.upload_document_blob(
            file_filename=doc.filename,
            file_content=file_content,
            kb_id=doc.kb_id,
        )

        if not ragflow_doc_id:
            raise HTTPException(status_code=500, detail="上传到RAGFlow失败")

        updated_doc = deps.kb_store.update_document_status(
            doc_id=doc_id,
            status="approved",
            reviewed_by=payload.sub,
            review_notes=review_data.review_notes if review_data else None,
            ragflow_doc_id=ragflow_doc_id,
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
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.role != "admin":
        if not user.group_id:
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

        group = deps.permission_group_store.get_group(user.group_id)
        if not group or not group.get("can_review", 0):
            raise HTTPException(status_code=403, detail="您没有审核权限，请联系管理员")

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

