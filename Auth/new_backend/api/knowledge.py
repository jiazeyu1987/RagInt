from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from typing import Annotated, Optional
import os
import uuid
from pathlib import Path

from authx import TokenPayload
from core.security import auth
from core.permissions import KbViewRequired, KbUploadRequired, KbDeleteRequired
from models.document import DocumentResponse, StatsResponse
from dependencies import AppDependencies
from config import settings


router = APIRouter()


def get_deps(request: Request) -> AppDependencies:
    return request.app.state.deps


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    request: Request,
    payload: KbUploadRequired,
    file: UploadFile = File(...),
    kb_id_form: Optional[str] = Form(None),  # Try to get from form first
    kb_id_query: Optional[str] = Query(None),    # Then try query parameter
    deps: AppDependencies = Depends(get_deps),
):
    """Upload document to knowledge base and RAGFlow"""
    import logging
    logger = logging.getLogger(__name__)

    # Print detailed request information
    logger.info("=" * 80)
    logger.info("UPLOAD REQUEST RECEIVED")
    logger.info("=" * 80)
    logger.info(f"Request URL: {request.url}")
    logger.info(f"Request method: {request.method}")
    logger.info(f"Query params: {dict(request.query_params)}")
    logger.info(f"Headers: {dict(request.headers)}")

    # Use kb_id from form or query parameter, default to '展厅'
    kb_id = kb_id_form or kb_id_query or "展厅"

    logger.info(f"kb_id_form (form field): {kb_id_form}")
    logger.info(f"kb_id_query (query param): {kb_id_query}")
    logger.info(f"Final kb_id: {kb_id}")
    logger.info(f"File: {file.filename}, content_type={file.content_type}")
    logger.info("=" * 80)

    # Validate file size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过限制")

    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    # Upload to RAGFlow first - this is the primary storage
    logger.info(f"Uploading {file.filename} to RAGFlow dataset '{kb_id}'")

    try:
        ragflow_doc_id = deps.ragflow_service.upload_document_blob(
            file_filename=file.filename,
            file_content=content,
            kb_id=kb_id
        )

        if not ragflow_doc_id:
            error_msg = f"Failed to upload {file.filename} to RAGFlow dataset '{kb_id}'"
            logger.error(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)

        logger.info(f"Successfully uploaded to RAGFlow, doc_id: {ragflow_doc_id}")

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"RAGFlow upload failed: {str(e)}"
        logger.error(error_msg)
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=error_msg)

    # Only create local record after successful RAGFlow upload
    doc = deps.kb_store.create_document(
        filename=file.filename,
        file_path="",  # No local file path, stored in RAGFlow
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        uploaded_by=payload.sub,
        kb_id=kb_id,
        status="approved"  # Auto-approved since directly uploaded to RAGFlow
    )

    # Update with RAGFlow doc_id
    deps.kb_store.update_document_status(
        doc.doc_id,
        "approved",
        ragflow_doc_id=ragflow_doc_id
    )

    # Refresh doc to get updated data
    doc = deps.kb_store.get_document(doc.doc_id)

    return DocumentResponse(
        doc_id=doc.doc_id,
        filename=doc.filename,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        uploaded_by=doc.uploaded_by,
        status=doc.status,
        uploaded_at_ms=doc.uploaded_at_ms,
        reviewed_by=doc.reviewed_by,
        reviewed_at_ms=doc.reviewed_at_ms,
        review_notes=doc.review_notes,
        ragflow_doc_id=doc.ragflow_doc_id,
        kb_id=doc.kb_id,
    )


@router.get("/documents")
async def list_documents(
    payload: KbViewRequired,
    deps: AppDependencies = Depends(get_deps),
    status: Optional[str] = None,
    kb_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    limit: int = 100,
):
    """List documents with optional filters"""

    # Get current user info to check role
    user = deps.user_store.get_by_user_id(payload.sub)

    # Operator role can only see their own documents
    if user and user.role == "operator" and uploaded_by is None:
        uploaded_by = user.user_id

    docs = deps.kb_store.list_documents(status=status, kb_id=kb_id, uploaded_by=uploaded_by, limit=limit)

    return {
        "documents": [
            {
                "doc_id": d.doc_id,
                "filename": d.filename,
                "file_size": d.file_size,
                "mime_type": d.mime_type,
                "uploaded_by": d.uploaded_by,
                "status": d.status,
                "uploaded_at_ms": d.uploaded_at_ms,
                "reviewed_by": d.reviewed_by,
                "reviewed_at_ms": d.reviewed_at_ms,
                "review_notes": d.review_notes,
                "ragflow_doc_id": d.ragflow_doc_id,
                "kb_id": d.kb_id,
            }
            for d in docs
        ],
        "count": len(docs)
    }


@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: str,
    payload: KbViewRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Get document details"""
    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    return {
        "doc_id": doc.doc_id,
        "filename": doc.filename,
        "file_size": doc.file_size,
        "mime_type": doc.mime_type,
        "uploaded_by": doc.uploaded_by,
        "status": doc.status,
        "uploaded_at_ms": doc.uploaded_at_ms,
        "reviewed_by": doc.reviewed_by,
        "reviewed_at_ms": doc.reviewed_at_ms,
        "review_notes": doc.review_notes,
        "ragflow_doc_id": doc.ragflow_doc_id,
        "kb_id": doc.kb_id,
    }


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: str,
    payload: KbViewRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Download document file"""
    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        path=doc.file_path,
        filename=doc.filename,
        media_type=doc.mime_type
    )


@router.get("/stats")
async def get_stats(
    payload: KbViewRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Get document statistics"""

    # Get current user info to check role
    user = deps.user_store.get_by_user_id(payload.sub)

    # For operator role, count only their own documents
    uploaded_by = None
    if user and user.role == "operator":
        uploaded_by = user.user_id

    total = deps.kb_store.count_documents(uploaded_by=uploaded_by)
    pending = deps.kb_store.count_documents(status="pending", uploaded_by=uploaded_by)
    approved = deps.kb_store.count_documents(status="approved", uploaded_by=uploaded_by)
    rejected = deps.kb_store.count_documents(status="rejected", uploaded_by=uploaded_by)

    return StatsResponse(
        total_documents=total,
        pending_documents=pending,
        approved_documents=approved,
        rejected_documents=rejected,
    )


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    payload: KbDeleteRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Delete document"""
    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # Delete file
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    # Delete from database
    deps.kb_store.delete_document(doc_id)

    return {"message": "文档已删除"}
