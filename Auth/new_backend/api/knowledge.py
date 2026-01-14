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
    deps: AppDependencies = Depends(get_deps),
):
    """
    上传文档到本地存储（pending状态）

    新流程：
    1. 检查用户是否有该知识库权限（管理员自动通过）
    2. 验证文件大小和类型
    3. 存储到本地 uploads 目录
    4. 创建本地记录（status=pending）
    5. 等待审核者批准后上传到RAGFlow
    """
    import logging
    logger = logging.getLogger(__name__)

    # ========== BACKEND STEP 1: Request Received ==========
    logger.info("=" * 80)
    logger.info("BACKEND: Upload request received")
    logger.info(f"BACKEND: Request URL: {request.url}")
    logger.info(f"BACKEND: Query params: {dict(request.query_params)}")
    logger.info(f"BACKEND: User ID from token: {payload.sub}")
    logger.info(f"BACKEND: Full payload: {payload}")
    logger.info(f"BACKEND: Payload attributes: dir={dir(payload)}")

    # Get kb_id from query parameter, default to '展厅'
    kb_id = request.query_params.get("kb_id", "展厅")

    logger.info(f"BACKEND: Extracted kb_id: {repr(kb_id)}")
    logger.info(f"BACKEND: kb_id type: {type(kb_id)}, length: {len(kb_id)}")
    logger.info(f"BACKEND: File info: name={file.filename}, size={file.size if hasattr(file, 'size') else 'unknown'}")
    logger.info("=" * 80)

    # 1. 检查知识库权限（管理员自动通过）
    user = deps.user_store.get_by_user_id(payload.sub)

    # ========== BACKEND STEP 2: Permission Check ==========
    logger.info(f"BACKEND: User info: username={user.username}, role={user.role}")

    if user.role != "admin":
        # 获取用户的所有知识库权限
        user_kbs = deps.user_kb_permission_store.get_user_kbs(payload.sub)
        logger.info(f"BACKEND: User's KB permissions from DB: {user_kbs}")
        logger.info(f"BACKEND: Checking if user has access to kb_id: {repr(kb_id)}")

        has_permission = deps.user_kb_permission_store.check_permission(payload.sub, kb_id)
        logger.info(f"BACKEND: Permission check result: {has_permission}")

        if not has_permission:
            logger.warning(f"BACKEND: ACCESS DENIED - User {user.username} does not have permission for kb '{kb_id}'")
            logger.warning(f"BACKEND: User has permissions: {user_kbs}")
            raise HTTPException(status_code=403, detail=f"无权访问该知识库: {kb_id}")

    logger.info(f"BACKEND: Permission check PASSED for user {user.username} (role: {user.role})")
    logger.info("=" * 80)

    # 2. Validate file size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过限制")

    # 3. Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    # 4. 存储到本地（而非直接上传RAGFlow）
    uploads_dir = Path(__file__).parent.parent / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    # 生成唯一文件名
    unique_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = uploads_dir / unique_filename

    # 写入文件
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"BACKEND: File saved locally to: {file_path}")

    # 5. 创建本地记录（pending状态）
    doc = deps.kb_store.create_document(
        filename=file.filename,
        file_path=str(file_path),
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        uploaded_by=payload.sub,
        kb_id=kb_id,
        status="pending"  # 关键修改：pending状态
    )

    # ========== BACKEND STEP 3: Upload Complete ==========
    logger.info(f"BACKEND: Document record created successfully")
    logger.info(f"BACKEND: doc_id={doc.doc_id}, filename={doc.filename}, kb_id={doc.kb_id}, status={doc.status}")
    logger.info(f"BACKEND: Uploaded by={payload.sub}, waiting for review")
    logger.info("=" * 80)

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
    """
    列出文档，带可选过滤器

    权限规则：
    - 管理员：可以看到所有文档
    - 其他角色：只能看到有权限的知识库的文档
    - 操作员：只能看到自己上传的文档
    """

    # 获取当前用户及其权限
    user = deps.user_store.get_by_user_id(payload.sub)

    # 非管理员用户只能看到有权限的知识库
    if user.role != "admin":
        user_kb_ids = deps.user_kb_permission_store.get_user_kbs(user.user_id)

        # 如果指定了kb_id，检查权限
        if kb_id and kb_id not in user_kb_ids:
            raise HTTPException(status_code=403, detail="无权访问该知识库")

        # 如果未指定kb_id，过滤结果（只返回用户有权限的KB文档）
        if kb_id is None:
            docs = deps.kb_store.list_documents(status=status, kb_id=None, uploaded_by=uploaded_by, limit=limit)
            # 过滤：只保留用户有权限的知识库文档
            docs = [d for d in docs if d.kb_id in user_kb_ids]
        else:
            docs = deps.kb_store.list_documents(status=status, kb_id=kb_id, uploaded_by=uploaded_by, limit=limit)
    else:
        # 管理员看到所有文档
        docs = deps.kb_store.list_documents(status=status, kb_id=kb_id, uploaded_by=uploaded_by, limit=limit)

    # operator角色只能看自己的文档
    if user.role == "operator" and uploaded_by is None:
        docs = [d for d in docs if d.uploaded_by == user.user_id]

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
    import logging
    logger = logging.getLogger(__name__)

    logger.info("=" * 80)
    logger.info("[DELETE] delete_document() called")
    logger.info(f"[DELETE]   doc_id: {doc_id}")
    logger.info(f"[DELETE]   deleted_by (payload.sub): {payload.sub}")

    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        logger.error(f"[DELETE] Document not found: {doc_id}")
        raise HTTPException(status_code=404, detail="文档不存在")

    logger.info(f"[DELETE]   Document found: filename={doc.filename}, kb_id={doc.kb_id}")
    logger.info(f"[DELETE]   file_path={doc.file_path}")
    logger.info(f"[DELETE]   original_uploader={doc.uploaded_by}, original_reviewer={doc.reviewed_by}")

    # 记录删除操作（在删除之前记录）
    logger.info("[DELETE] Calling deletion_log_store.log_deletion()...")
    deps.deletion_log_store.log_deletion(
        doc_id=doc.doc_id,
        filename=doc.filename,
        kb_id=doc.kb_id,
        deleted_by=payload.sub,
        original_uploader=doc.uploaded_by,
        original_reviewer=doc.reviewed_by,
        ragflow_doc_id=doc.ragflow_doc_id,
    )
    logger.info("[DELETE] Deletion log saved")

    # Delete file
    if os.path.exists(doc.file_path):
        logger.info(f"[DELETE] Deleting file: {doc.file_path}")
        os.remove(doc.file_path)
        logger.info("[DELETE] File deleted successfully")
    else:
        logger.warning(f"[DELETE] File not found: {doc.file_path}")

    # Delete from database
    logger.info("[DELETE] Deleting from database...")
    deps.kb_store.delete_document(doc_id)
    logger.info("[DELETE] Database record deleted")

    logger.info("[DELETE] Delete operation completed successfully")
    logger.info("=" * 80)

    return {"message": "文档已删除"}


@router.get("/deletions")
async def list_deletions(
    payload: KbViewRequired,
    deps: AppDependencies = Depends(get_deps),
    kb_id: Optional[str] = None,
    limit: int = 100,
):
    """
    获取删除记录列表

    权限规则：
    - 管理员：可以看到所有删除记录
    - 其他角色：只能看到有权限的知识库的删除记录
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 非管理员用户只能看到有权限的知识库
    if user.role != "admin":
        user_kb_ids = deps.user_kb_permission_store.get_user_kbs(user.user_id)

        # 如果指定了kb_id，检查权限
        if kb_id and kb_id not in user_kb_ids:
            raise HTTPException(status_code=403, detail="无权访问该知识库")

        # 如果未指定kb_id，过滤结果
        if kb_id is None:
            all_deletions = deps.deletion_log_store.list_deletions(kb_id=None, limit=limit)
            deletions = [d for d in all_deletions if d.kb_id in user_kb_ids]
        else:
            deletions = deps.deletion_log_store.list_deletions(kb_id=kb_id, limit=limit)
    else:
        # 管理员看到所有删除记录
        deletions = deps.deletion_log_store.list_deletions(kb_id=kb_id, limit=limit)

    return {
        "deletions": [
            {
                "id": d.id,
                "doc_id": d.doc_id,
                "filename": d.filename,
                "kb_id": d.kb_id,
                "deleted_by": d.deleted_by,
                "deleted_at_ms": d.deleted_at_ms,
                "original_uploader": d.original_uploader,
                "original_reviewer": d.original_reviewer,
                "ragflow_doc_id": d.ragflow_doc_id,
            }
            for d in deletions
        ],
        "count": len(deletions)
    }
