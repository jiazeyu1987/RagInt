from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from typing import Annotated, Optional

from authx import TokenPayload
from core.security import auth
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


@router.get("/datasets")
async def list_datasets(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """
    列出RAGFlow数据集（基于权限组过滤）

    权限规则：
    - 管理员：可以看到所有数据集
    - 其他角色：根据权限组的accessible_kbs配置
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info("=" * 80)
    logger.info("[GET /api/ragflow/datasets] Called")

    # 获取当前用户
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        logger.error("[GET /api/ragflow/datasets] User not found")
        raise HTTPException(status_code=404, detail="用户不存在")

    logger.info(f"[GET /api/ragflow/datasets] Current user: {user.username}, role: {user.role}, group_id: {user.group_id}")

    # 获取所有数据集
    all_datasets = deps.ragflow_service.list_datasets()
    logger.info(f"[GET /api/ragflow/datasets] Total datasets from RAGFlow: {len(all_datasets)}")
    for ds in all_datasets:
        logger.info(f"  - Dataset: id={ds.get('id')}, name={ds.get('name')}")

    # 管理员返回所有数据集
    if user.role == "admin":
        logger.info(f"[GET /api/ragflow/datasets] Admin user {user.username} showing all {len(all_datasets)} datasets")
        return {"datasets": all_datasets}

    # 非管理员用户根据权限组过滤
    if not user.group_id:
        logger.warning(f"[GET /api/ragflow/datasets] User {user.username} has no group_id, returning empty datasets")
        return {"datasets": []}

    group = deps.permission_group_store.get_group(user.group_id)
    if not group:
        logger.warning(f"[GET /api/ragflow/datasets] User {user.username} has invalid group_id {user.group_id}, returning empty datasets")
        return {"datasets": []}

    logger.info(f"[GET /api/ragflow/datasets] User's permission group: {group['group_name']}")

    # 获取权限组配置的可访问知识库
    accessible_kbs = group.get('accessible_kbs', [])
    logger.info(f"[GET /api/ragflow/datasets] Accessible KBs from permission group: {accessible_kbs}")

    if accessible_kbs and len(accessible_kbs) > 0:
        # 权限组指定了具体的知识库，需要过滤
        logger.info(f"[GET /api/ragflow/datasets] Filtering datasets, accessible_kbs is not empty")
        filtered_datasets = []
        for ds in all_datasets:
            ds_name = ds.get('name')
            if ds_name in accessible_kbs:
                filtered_datasets.append(ds)
                logger.info(f"  ✓ Match: {ds_name}")
            else:
                logger.info(f"  ✗ No match: {ds_name}")

        logger.info(f"[GET /api/ragflow/datasets] User {user.username} can access {len(filtered_datasets)} datasets")
        return {"datasets": filtered_datasets}
    else:
        # 权限组的 accessible_kbs 为空数组，返回所有
        logger.info(f"[GET /api/ragflow/datasets] Accessible KBs is empty, showing all {len(all_datasets)} datasets")
        return {"datasets": all_datasets}


@router.get("/documents")
async def list_ragflow_documents(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset_name: str = "展厅",
):
    """List documents in RAGFlow dataset"""
    documents = deps.ragflow_service.list_documents(dataset_name)
    return {"documents": documents, "dataset": dataset_name}


@router.get("/documents/{doc_id}/status")
async def get_document_status(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset_name: str = "展厅",
):
    """Get document status from RAGFlow"""
    status = deps.ragflow_service.get_document_status(doc_id, dataset_name)
    if status is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"doc_id": doc_id, "status": status}


@router.get("/documents/{doc_id}")
async def get_document_detail(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset_name: str = "展厅",
):
    """Get document detail from RAGFlow"""
    detail = deps.ragflow_service.get_document_detail(doc_id, dataset_name)
    if detail is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    return detail


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset: str = "展厅",
    filename: str = None,
):
    """Download document from RAGFlow"""
    import logging
    import urllib.parse

    logger = logging.getLogger(__name__)
    logger.info("=" * 80)
    logger.info("[DOWNLOAD] download_document() called")
    logger.info(f"[DOWNLOAD]   doc_id: {doc_id}")
    logger.info(f"[DOWNLOAD]   dataset: {dataset}")
    logger.info(f"[DOWNLOAD]   downloaded_by: {payload.sub}")

    try:
        file_content, ragflow_filename = deps.ragflow_service.download_document(doc_id, dataset)

        if file_content is None:
            logger.error(f"[DOWNLOAD] Failed to download document {doc_id} from RAGFlow")
            raise HTTPException(status_code=404, detail="文档不存在或下载失败")

        logger.info(f"[DOWNLOAD] Successfully downloaded {len(file_content)} bytes, filename={ragflow_filename}")

        # 记录下载日志
        deps.download_log_store.log_download(
            doc_id=doc_id,
            filename=ragflow_filename or f"document_{doc_id}",
            kb_id=dataset,
            downloaded_by=payload.sub,
            ragflow_doc_id=doc_id,
            is_batch=False
        )
        logger.info("[DOWNLOAD] Download logged to database")

        # Use client-provided filename or ragflow filename
        final_filename = filename or ragflow_filename or f"document_{doc_id}"

        # Handle Unicode filenames in Content-Disposition
        try:
            final_filename.encode('ascii')
            content_disposition = f'attachment; filename="{final_filename}"'
        except UnicodeEncodeError:
            ascii_filename = final_filename.encode('ascii', 'replace').decode('ascii')
            encoded_filename = urllib.parse.quote(final_filename)
            content_disposition = (
                f"attachment; filename=\"{ascii_filename}\"; "
                f"filename*=UTF-8''{encoded_filename}"
            )

        logger.info("[DOWNLOAD] Download operation completed successfully")
        logger.info("=" * 80)

        return Response(
            content=file_content,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": content_disposition
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DOWNLOAD] Exception during download: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")


@router.get("/documents/{doc_id}/preview")
async def preview_document(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset: str = "展厅",
):
    """
    预览文档内容（根据文件类型返回不同格式）

    支持的文件类型：
    - 文本文件 (.txt, .md, .csv, .json): 返回文本内容
    - 图片 (.png, .jpg, .jpeg, .gif, .bmp): 返回图片base64或URL
    - PDF: 返回PDF文件内容
    - 其他: 返回不支持预览的提示
    """
    import logging
    import base64
    from pathlib import Path

    logger = logging.getLogger(__name__)
    logger.info("=" * 80)
    logger.info("[PREVIEW] preview_document() called")
    logger.info(f"[PREVIEW]   doc_id: {doc_id}")
    logger.info(f"[PREVIEW]   dataset: {dataset}")
    logger.info(f"[PREVIEW]   user: {payload.sub}")

    try:
        # 下载文档
        file_content, filename = deps.ragflow_service.download_document(doc_id, dataset)

        if file_content is None:
            logger.error(f"[PREVIEW] Failed to download document {doc_id}")
            raise HTTPException(status_code=404, detail="文档不存在")

        # 检查文件扩展名
        file_ext = Path(filename).suffix.lower() if filename else ""
        logger.info(f"[PREVIEW] File extension: {file_ext}")

        # 文本文件类型
        text_extensions = ['.txt', '.md', '.csv', '.json', '.xml', '.log', '.svg', '.html', '.css', '.js']

        # 图片文件类型
        image_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']

        if file_ext in text_extensions:
            # 文本文件：直接返回文本内容
            try:
                text_content = file_content.decode('utf-8')
                logger.info(f"[PREVIEW] Returning text content ({len(text_content)} chars)")
                return {
                    "type": "text",
                    "filename": filename,
                    "content": text_content
                }
            except UnicodeDecodeError:
                try:
                    text_content = file_content.decode('gbk')
                    logger.info(f"[PREVIEW] Returning text content with GBK encoding ({len(text_content)} chars)")
                    return {
                        "type": "text",
                        "filename": filename,
                        "content": text_content
                    }
                except:
                    logger.error(f"[PREVIEW] Failed to decode text file")
                    raise HTTPException(status_code=400, detail="无法解码文本文件")

        elif file_ext in image_extensions:
            # 图片文件：返回base64编码的图片
            base64_image = base64.b64encode(file_content).decode('utf-8')
            image_type = file_ext[1:]  # 去掉点号
            logger.info(f"[PREVIEW] Returning image content ({len(file_content)} bytes)")
            return {
                "type": "image",
                "filename": filename,
                "content": base64_image,
                "image_type": image_type
            }

        elif file_ext == '.pdf':
            # PDF文件：返回base64编码的PDF
            base64_pdf = base64.b64encode(file_content).decode('utf-8')
            logger.info(f"[PREVIEW] Returning PDF content ({len(file_content)} bytes)")
            return {
                "type": "pdf",
                "filename": filename,
                "content": base64_pdf
            }

        else:
            # 其他文件类型：不支持预览
            logger.warning(f"[PREVIEW] Unsupported file type: {file_ext}")
            return {
                "type": "unsupported",
                "filename": filename,
                "message": f"不支持的文件类型: {file_ext}，请下载后查看"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PREVIEW] Exception: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"预览失败: {str(e)}")


@router.delete("/documents/{doc_id}")
async def delete_ragflow_document(
    doc_id: str,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset_name: str = "展厅",
):
    """Delete document from RAGFlow (based on permission group)"""
    import logging
    logger = logging.getLogger(__name__)

    logger.info("=" * 80)
    logger.info("[DELETE RAGFLOW] delete_ragflow_document() called")
    logger.info(f"[DELETE RAGFLOW]   doc_id: {doc_id}")
    logger.info(f"[DELETE RAGFLOW]   dataset_name: {dataset_name}")
    logger.info(f"[DELETE RAGFLOW]   deleted_by: {payload.sub}")

    # 获取用户并检查删除权限
    user = deps.user_store.get_by_user_id(payload.sub)
    if not user:
        logger.error("[DELETE RAGFLOW] User not found")
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员可以直接删除
    if user.role != "admin":
        # 非管理员需要检查权限组的 can_delete 权限
        if not user.group_id:
            logger.warning(f"[DELETE RAGFLOW] User {user.username} has no group_id")
            raise HTTPException(status_code=403, detail="您没有删除权限，请联系管理员")

        group = deps.permission_group_store.get_group(user.group_id)
        if not group or not group.get('can_delete', 0):
            logger.warning(f"[DELETE RAGFLOW] User {user.username} has no delete permission")
            raise HTTPException(status_code=403, detail="您没有删除权限，请联系管理员")

    # 查找本地数据库中对应的文档记录
    local_doc = deps.kb_store.get_document_by_ragflow_id(doc_id, dataset_name)

    # 从RAGFlow删除文档
    success = deps.ragflow_service.delete_document(doc_id, dataset_name)
    if not success:
        logger.error(f"[DELETE RAGFLOW] Failed to delete from RAGFlow: {doc_id}")
        raise HTTPException(status_code=404, detail="文档不存在或删除失败")

    logger.info("[DELETE RAGFLOW] RAGFlow document deleted successfully")

    # 如果本地有记录，也删除本地记录并记录到deletion_logs
    if local_doc:
        logger.info(f"[DELETE RAGFLOW] Found local record: {local_doc.doc_id}, filename={local_doc.filename}")

        # 记录到删除日志
        deps.deletion_log_store.log_deletion(
            doc_id=local_doc.doc_id,
            filename=local_doc.filename,
            kb_id=local_doc.kb_id,
            deleted_by=payload.sub,
            original_uploader=local_doc.uploaded_by,
            original_reviewer=local_doc.reviewed_by,
            ragflow_doc_id=doc_id,
        )
        logger.info("[DELETE RAGFLOW] Deletion logged to local database")

        # 删除本地文件（如果存在）
        import os
        if os.path.exists(local_doc.file_path):
            logger.info(f"[DELETE RAGFLOW] Deleting local file: {local_doc.file_path}")
            os.remove(local_doc.file_path)
            logger.info("[DELETE RAGFLOW] Local file deleted")

        # 删除本地数据库记录
        deps.kb_store.delete_document(local_doc.doc_id)
        logger.info("[DELETE RAGFLOW] Local database record deleted")
    else:
        logger.warning(f"[DELETE RAGFLOW] No local record found for RAGFlow doc_id: {doc_id}")
        # 即使没有本地记录，也记录到deletion_logs（使用RAGFlow的doc_id）
        deps.deletion_log_store.log_deletion(
            doc_id=doc_id,  # 使用RAGFlow的doc_id
            filename=f"RAGFlow文档({doc_id[:8]}...)",  # 文件名未知
            kb_id=dataset_name,
            deleted_by=payload.sub,
            original_uploader=None,
            original_reviewer=None,
            ragflow_doc_id=doc_id,
        )
        logger.info("[DELETE RAGFLOW] Deletion logged (RAGFlow only)")

    logger.info("[DELETE RAGFLOW] Delete operation completed successfully")
    logger.info("=" * 80)

    return {"message": "文档已从RAGFlow删除"}


@router.post("/documents/batch/download")
async def batch_download_documents(
    request: Request,
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Batch download documents from RAGFlow as ZIP"""
    import logging
    logger = logging.getLogger(__name__)

    data = await request.json()
    documents_info = data.get("documents", [])

    logger.info("=" * 80)
    logger.info("[BATCH DOWNLOAD] batch_download_documents() called")
    logger.info(f"[BATCH DOWNLOAD]   Number of documents: {len(documents_info)}")
    logger.info(f"[BATCH DOWNLOAD]   downloaded_by: {payload.sub}")

    if not documents_info:
        logger.warning("[BATCH DOWNLOAD] No documents in request")
        raise HTTPException(status_code=400, detail="no_documents_selected")

    zip_content, filename = deps.ragflow_service.batch_download_documents(documents_info)
    if zip_content is None:
        logger.error("[BATCH DOWNLOAD] Failed to create zip - service returned None")
        raise HTTPException(status_code=500, detail="批量下载失败")

    # 记录批量下载日志（为每个文档记录一条）
    for doc_info in documents_info:
        doc_id = doc_info.get("doc_id") or doc_info.get("id")
        doc_name = doc_info.get("name", "unknown")
        dataset = doc_info.get("dataset", "展厅")

        deps.download_log_store.log_download(
            doc_id=doc_id,
            filename=doc_name,
            kb_id=dataset,
            downloaded_by=payload.sub,
            ragflow_doc_id=doc_id,
            is_batch=True
        )

    logger.info(f"[BATCH DOWNLOAD] Recorded {len(documents_info)} download logs")
    logger.info(f"[BATCH DOWNLOAD] Sending zip file: {filename}, size: {len(zip_content)} bytes")
    logger.info("[BATCH DOWNLOAD] Batch download operation completed successfully")
    logger.info("=" * 80)

    return Response(
        content=zip_content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/downloads")
async def list_downloads(
    payload: AuthRequired,
    deps: AppDependencies = Depends(get_deps),
    kb_id: Optional[str] = None,
    downloaded_by: Optional[str] = None,
    limit: int = 100,
):
    """
    获取下载记录列表

    权限规则：
    - 管理员：可以看到所有下载记录
    - 其他角色：只能看到自己的下载记录
    """
    user = deps.user_store.get_by_user_id(payload.sub)

    # 非管理员用户只能看到自己的下载记录
    if user.role != "admin":
        downloaded_by = payload.sub

    downloads = deps.download_log_store.list_downloads(
        kb_id=kb_id,
        downloaded_by=downloaded_by,
        limit=limit
    )

    return {
        "downloads": [
            {
                "id": d.id,
                "doc_id": d.doc_id,
                "filename": d.filename,
                "kb_id": d.kb_id,
                "downloaded_by": d.downloaded_by,
                "downloaded_at_ms": d.downloaded_at_ms,
                "ragflow_doc_id": d.ragflow_doc_id,
                "is_batch": d.is_batch,
            }
            for d in downloads
        ],
        "count": len(downloads)
    }
