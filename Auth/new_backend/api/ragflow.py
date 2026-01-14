from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from typing import Annotated, Optional

from authx import TokenPayload
from core.security import auth
from core.permissions import RagflowViewRequired, RagflowDeleteRequired
from dependencies import AppDependencies


router = APIRouter()


def get_deps(request: Request) -> AppDependencies:
    return request.app.state.deps


@router.get("/datasets")
async def list_datasets(
    payload: RagflowViewRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """List RAGFlow datasets"""
    datasets = deps.ragflow_service.list_datasets()
    return {"datasets": datasets}


@router.get("/documents")
async def list_ragflow_documents(
    payload: RagflowViewRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset_name: str = "展厅",
):
    """List documents in RAGFlow dataset"""
    documents = deps.ragflow_service.list_documents(dataset_name)
    return {"documents": documents, "dataset": dataset_name}


@router.get("/documents/{doc_id}/status")
async def get_document_status(
    doc_id: str,
    payload: RagflowViewRequired,
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
    payload: RagflowViewRequired,
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
    payload: RagflowViewRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset: str = "展厅",
    filename: str = None,
):
    """Download document from RAGFlow"""
    import logging
    import urllib.parse

    logger = logging.getLogger(__name__)
    logger.info(f"Download request for doc_id={doc_id}, dataset={dataset}")

    try:
        file_content, ragflow_filename = deps.ragflow_service.download_document(doc_id, dataset)

        if file_content is None:
            logger.error(f"Failed to download document {doc_id} from RAGFlow")
            raise HTTPException(status_code=404, detail="文档不存在或下载失败")

        logger.info(f"Successfully downloaded {len(file_content)} bytes, filename={ragflow_filename}")

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
        logger.error(f"Exception during download: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")


@router.delete("/documents/{doc_id}")
async def delete_ragflow_document(
    doc_id: str,
    payload: RagflowDeleteRequired,
    deps: AppDependencies = Depends(get_deps),
    dataset_name: str = "展厅",
):
    """Delete document from RAGFlow"""
    success = deps.ragflow_service.delete_document(doc_id, dataset_name)
    if not success:
        raise HTTPException(status_code=404, detail="文档不存在或删除失败")
    return {"message": "文档已从RAGFlow删除"}


@router.post("/documents/batch/download")
async def batch_download_documents(
    request: Request,
    payload: RagflowViewRequired,
    deps: AppDependencies = Depends(get_deps),
):
    """Batch download documents from RAGFlow as ZIP"""
    import logging
    logger = logging.getLogger(__name__)

    data = await request.json()
    documents_info = data.get("documents", [])

    logger.info(f"Received batch download request with {len(documents_info)} documents")
    logger.info(f"Request data: {documents_info}")

    if not documents_info:
        logger.warning("No documents in request")
        raise HTTPException(status_code=400, detail="no_documents_selected")

    zip_content, filename = deps.ragflow_service.batch_download_documents(documents_info)
    if zip_content is None:
        logger.error("Failed to create zip - service returned None")
        raise HTTPException(status_code=500, detail="批量下载失败")

    logger.info(f"Sending zip file: {filename}, size: {len(zip_content)} bytes")

    return Response(
        content=zip_content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
