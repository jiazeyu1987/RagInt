from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Annotated

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
    """Approve document and upload to RAGFlow"""
    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.status != "pending":
        raise HTTPException(status_code=400, detail="文档不是待审核状态")

    try:
        # Upload to RAGFlow
        ragflow_doc_id = deps.ragflow_service.upload_document(doc.file_path, doc.kb_id)

        # Update document status
        updated_doc = deps.kb_store.update_document_status(
            doc_id=doc_id,
            status="approved",
            reviewed_by=payload.sub,
            review_notes=review_data.review_notes,
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传到RAGFlow失败: {str(e)}")


@router.post("/documents/{doc_id}/reject", response_model=DocumentResponse)
async def reject_document(
    doc_id: str,
    payload: KbRejectRequired,
    deps: AppDependencies = Depends(get_deps),
    review_data: DocumentReviewRequest = None,
):
    """Reject document"""
    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.status != "pending":
        raise HTTPException(status_code=400, detail="文档不是待审核状态")

    updated_doc = deps.kb_store.update_document_status(
        doc_id=doc_id,
        status="rejected",
        reviewed_by=payload.sub,
        review_notes=review_data.review_notes,
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
