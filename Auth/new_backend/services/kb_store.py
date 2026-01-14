import sqlite3
import time
import uuid
from dataclasses import dataclass
from typing import Optional, List
from pathlib import Path


@dataclass
class KbDocument:
    doc_id: str
    filename: str
    file_path: str
    file_size: int
    mime_type: str
    uploaded_by: str
    status: str
    uploaded_at_ms: int
    reviewed_by: Optional[str] = None
    reviewed_at_ms: Optional[int] = None
    review_notes: Optional[str] = None
    ragflow_doc_id: Optional[str] = None
    kb_id: str = "展厅"


class KbStore:
    def __init__(self, db_path: str = None):
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "auth.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self):
        return sqlite3.connect(str(self.db_path))

    def create_document(
        self,
        filename: str,
        file_path: str,
        file_size: int,
        mime_type: str,
        uploaded_by: str,
        kb_id: str = "展厅",
        status: str = "pending"
    ) -> KbDocument:
        doc_id = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO kb_documents (
                    doc_id, filename, file_path, file_size, mime_type,
                    uploaded_by, status, uploaded_at_ms, kb_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (doc_id, filename, file_path, file_size, mime_type,
                  uploaded_by, status, now_ms, kb_id))
            conn.commit()
            return KbDocument(
                doc_id=doc_id,
                filename=filename,
                file_path=file_path,
                file_size=file_size,
                mime_type=mime_type,
                uploaded_by=uploaded_by,
                status=status,
                uploaded_at_ms=now_ms,
                kb_id=kb_id
            )
        finally:
            conn.close()

    def get_document(self, doc_id: str) -> Optional[KbDocument]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT doc_id, filename, file_path, file_size, mime_type,
                       uploaded_by, status, uploaded_at_ms, reviewed_by,
                       reviewed_at_ms, review_notes, ragflow_doc_id, kb_id
                FROM kb_documents WHERE doc_id = ?
            """, (doc_id,))
            row = cursor.fetchone()
            if row:
                return KbDocument(*row)
            return None
        finally:
            conn.close()

    def list_documents(
        self,
        status: Optional[str] = None,
        kb_id: Optional[str] = None,
        uploaded_by: Optional[str] = None,
        limit: int = 100
    ) -> List[KbDocument]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            query = """
                SELECT doc_id, filename, file_path, file_size, mime_type,
                       uploaded_by, status, uploaded_at_ms, reviewed_by,
                       reviewed_at_ms, review_notes, ragflow_doc_id, kb_id
                FROM kb_documents
                WHERE 1=1
            """
            params = []

            if status:
                query += " AND status = ?"
                params.append(status)
            if kb_id:
                query += " AND kb_id = ?"
                params.append(kb_id)
            if uploaded_by:
                query += " AND uploaded_by = ?"
                params.append(uploaded_by)

            query += " ORDER BY uploaded_at_ms DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [KbDocument(*row) for row in rows]
        finally:
            conn.close()

    def update_document_status(
        self,
        doc_id: str,
        status: str,
        reviewed_by: Optional[str] = None,
        review_notes: Optional[str] = None,
        ragflow_doc_id: Optional[str] = None
    ) -> Optional[KbDocument]:
        now_ms = int(time.time() * 1000)
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                UPDATE kb_documents
                SET status = ?, reviewed_by = ?, reviewed_at_ms = ?, review_notes = ?, ragflow_doc_id = ?
                WHERE doc_id = ?
            """, (status, reviewed_by, now_ms, review_notes, ragflow_doc_id, doc_id))
            conn.commit()
            return self.get_document(doc_id)
        finally:
            conn.close()

    def delete_document(self, doc_id: str) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM kb_documents WHERE doc_id = ?", (doc_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def count_documents(
        self,
        status: Optional[str] = None,
        kb_id: Optional[str] = None,
        uploaded_by: Optional[str] = None
    ) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            query = "SELECT COUNT(*) FROM kb_documents WHERE 1=1"
            params = []

            if status:
                query += " AND status = ?"
                params.append(status)
            if kb_id:
                query += " AND kb_id = ?"
                params.append(kb_id)
            if uploaded_by:
                query += " AND uploaded_by = ?"
                params.append(uploaded_by)

            cursor.execute(query, params)
            return cursor.fetchone()[0]
        finally:
            conn.close()
