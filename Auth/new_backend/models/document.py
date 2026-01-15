from pydantic import BaseModel
from typing import Optional, List


class DocumentResponse(BaseModel):
    """Document response model"""
    doc_id: str
    filename: str
    file_size: int
    mime_type: str
    uploaded_by: str
    status: str
    uploaded_at_ms: int
    reviewed_by: Optional[str] = None
    reviewed_at_ms: Optional[int] = None
    review_notes: Optional[str] = None
    ragflow_doc_id: Optional[str] = None
    kb_id: str


class DocumentReviewRequest(BaseModel):
    """Document review request model"""
    review_notes: Optional[str] = None


class StatsResponse(BaseModel):
    """Statistics response model"""
    total_documents: int
    pending_documents: int
    approved_documents: int
    rejected_documents: int


class BatchDownloadRequest(BaseModel):
    """Batch download request model"""
    doc_ids: List[str]
