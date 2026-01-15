from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response
from typing import Annotated, Optional
import os
import uuid
import zipfile
import io
from pathlib import Path

from authx import TokenPayload
from core.security import auth
from models.document import DocumentResponse
from dependencies import AppDependencies
from config import settings


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


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    request: Request,
    payload: AuthRequired,
    file: UploadFile = File(...),
    deps: AppDependencies = Depends(get_deps),
):
    """
    上传文档到本地存储（pending状态）
    基于权限组检查上传权限
    """
    import logging
    logger = logging.getLogger(__name__)

    # Get kb_id from query parameter, default to '展厅'
    kb_id = request.query_params.get("kb_id", "展厅")

    # 获取用户并检查上传权限
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员可以直接上传
    if user.role != "admin":
        # 非管理员需要检查权限组的 can_upload 权限
        if not user.group_id:
            raise HTTPException(status_code=403, detail="您没有上传权限，请联系管理员")

        group = deps.permission_group_store.get_group(user.group_id)
        if not group or not group.get('can_upload', 0):
            raise HTTPException(status_code=403, detail="您没有上传权限，请联系管理员")

    logger.info(f"[UPLOAD] User {user.username} uploading to kb_id={kb_id}")

    # Validate file size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过限制")

    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    # 存储到本地
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
    payload: AuthRequired,
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
    - 其他角色：可以看到所有文档（基于权限组，无其他限制）
    """
    import logging
    logger = logging.getLogger(__name__)

    user = deps.user_store.get_by_user_id(payload.sub)
    logger.info(f"[LIST DOCS] User: {user.username}, role: {user.role}, kb_id: {kb_id}, status: {status}")

    # 管理员可以看到所有文档
    docs = deps.kb_store.list_documents(status=status, kb_id=kb_id, uploaded_by=uploaded_by, limit=limit)

    logger.info(f"[LIST DOCS] Found {len(docs)} documents")

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
    payload: AuthRequired,
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
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Download document file"""
    import logging
    logger = logging.getLogger(__name__)

    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    # 记录下载日志
    deps.download_log_store.log_download(
        doc_id=doc.doc_id,
        filename=doc.filename,
        kb_id=doc.kb_id,
        downloaded_by=payload.sub
    )
    logger.info(f"[DOWNLOAD] Document {doc_id} ({doc.filename}) downloaded by {payload.sub}")

    return FileResponse(
        path=doc.file_path,
        filename=doc.filename,
        media_type=doc.mime_type
    )


@router.get("/stats")
async def get_stats(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Get document statistics"""
    total = deps.kb_store.count_documents()
    pending = deps.kb_store.count_documents(status="pending")
    approved = deps.kb_store.count_documents(status="approved")
    rejected = deps.kb_store.count_documents(status="rejected")

    return {
        "total_documents": total,
        "pending_documents": pending,
        "approved_documents": approved,
        "rejected_documents": rejected,
    }


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Delete document (based on permission group)"""
    import logging
    logger = logging.getLogger(__name__)

    # 获取用户并检查删除权限
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员可以直接删除
    if user.role != "admin":
        # 非管理员需要检查权限组的 can_delete 权限
        if not user.group_id:
            raise HTTPException(status_code=403, detail="您没有删除权限，请联系管理员")

        group = deps.permission_group_store.get_group(user.group_id)
        if not group or not group.get('can_delete', 0):
            raise HTTPException(status_code=403, detail="您没有删除权限，请联系管理员")

    logger.info(f"[DELETE] delete_document() called, doc_id: {doc_id}, deleted_by: {payload.sub}")

    doc = deps.kb_store.get_document(doc_id)
    if not doc:
        logger.error(f"[DELETE] Document not found: {doc_id}")
        raise HTTPException(status_code=404, detail="文档不存在")

    # 记录删除操作
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
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    kb_id: Optional[str] = None,
    limit: int = 100,
):
    """
    获取删除记录列表

    权限规则：
    - 管理员：可以看到所有删除记录
    - 其他角色：可以看到所有删除记录
    """
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


@router.post("/documents/batch/download")
async def batch_download_documents(
    request: Request,
    payload: AuthRequired,
    body: dict,
    deps: AppDependencies = Depends(get_deps),
):
    """
    批量下载文档（打包成ZIP）
    """
    import logging
    logger = logging.getLogger(__name__)

    doc_ids = body.get("doc_ids", [])
    logger.info(f"[BATCH DOWNLOAD] Request to download {len(doc_ids)} documents")
    logger.info(f"[BATCH DOWNLOAD] User: {payload.sub}")

    # 获取文档
    valid_docs = []
    for doc_id in doc_ids:
        doc = deps.kb_store.get_document(doc_id)
        if not doc:
            logger.warning(f"[BATCH DOWNLOAD] Document not found: {doc_id}")
            continue

        # 检查文件是否存在
        if not os.path.exists(doc.file_path):
            logger.warning(f"[BATCH DOWNLOAD] File not found: {doc.file_path}")
            continue

        valid_docs.append(doc)

    if len(valid_docs) == 0:
        raise HTTPException(status_code=404, detail="没有找到可下载的文档")

    logger.info(f"[BATCH DOWNLOAD] Found {len(valid_docs)} valid documents for download")

    # 创建ZIP文件（在内存中）
    import time
    zip_buffer = io.BytesIO()
    created_at_ms = int(time.time() * 1000)

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for doc in valid_docs:
            # 添加文件到ZIP，使用原始文件名
            # 如果文件名重复，添加序号
            zip_name = doc.filename
            counter = 1
            while zip_name in [f.filename for f in valid_docs if f.filename != doc.filename]:
                name, ext = os.path.splitext(doc.filename)
                zip_name = f"{name}_{counter}{ext}"
                counter += 1

            try:
                zip_file.write(doc.file_path, zip_name)
                logger.info(f"[BATCH DOWNLOAD] Added to ZIP: {zip_name}")
            except Exception as e:
                logger.error(f"[BATCH DOWNLOAD] Failed to add {doc.filename} to ZIP: {e}")
                continue

    zip_buffer.seek(0)

    # 生成ZIP文件名
    zip_filename = f"documents_{created_at_ms}.zip"

    # 记录下载日志
    for doc in valid_docs:
        deps.download_log_store.log_download(
            doc_id=doc.doc_id,
            filename=doc.filename,
            kb_id=doc.kb_id,
            downloaded_by=payload.sub,
            is_batch=True
        )

    logger.info(f"[BATCH DOWNLOAD] ZIP file created: {zip_filename} with {len(valid_docs)} files")

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"'
        }
    )
