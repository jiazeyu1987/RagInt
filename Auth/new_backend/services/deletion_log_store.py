import sqlite3
import time
from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path


@dataclass
class DeletionLog:
    id: int
    doc_id: str
    filename: str
    kb_id: str
    deleted_by: str
    deleted_at_ms: int
    original_uploader: Optional[str] = None
    original_reviewer: Optional[str] = None
    ragflow_doc_id: Optional[str] = None


class DeletionLogStore:
    def __init__(self, db_path: str = None):
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "auth.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self):
        return sqlite3.connect(str(self.db_path))

    def log_deletion(
        self,
        doc_id: str,
        filename: str,
        kb_id: str,
        deleted_by: str,
        original_uploader: Optional[str] = None,
        original_reviewer: Optional[str] = None,
        ragflow_doc_id: Optional[str] = None
    ) -> DeletionLog:
        """记录文件删除操作"""
        now_ms = int(time.time() * 1000)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO deletion_logs (
                    doc_id, filename, kb_id, deleted_by, deleted_at_ms,
                    original_uploader, original_reviewer, ragflow_doc_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (doc_id, filename, kb_id, deleted_by, now_ms,
                  original_uploader, original_reviewer, ragflow_doc_id))
            conn.commit()

            # 获取插入的记录
            cursor.execute("SELECT last_insert_rowid()")
            log_id = cursor.fetchone()[0]

            log_to_file(f"[DELETE] 文件删除记录已保存: doc_id={doc_id}, filename={filename}, kb_id={kb_id}, deleted_by={deleted_by}")

            return DeletionLog(
                id=log_id,
                doc_id=doc_id,
                filename=filename,
                kb_id=kb_id,
                deleted_by=deleted_by,
                deleted_at_ms=now_ms,
                original_uploader=original_uploader,
                original_reviewer=original_reviewer,
                ragflow_doc_id=ragflow_doc_id
            )
        finally:
            conn.close()

    def list_deletions(
        self,
        kb_id: Optional[str] = None,
        limit: int = 100
    ) -> List[DeletionLog]:
        """获取删除记录列表"""
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            query = """
                SELECT id, doc_id, filename, kb_id, deleted_by, deleted_at_ms,
                       original_uploader, original_reviewer, ragflow_doc_id
                FROM deletion_logs
                WHERE 1=1
            """
            params = []

            if kb_id:
                query += " AND kb_id = ?"
                params.append(kb_id)

            query += " ORDER BY deleted_at_ms DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [DeletionLog(*row) for row in rows]
        finally:
            conn.close()


def log_to_file(message: str):
    """写入日志到文件"""
    from pathlib import Path
    LOG_FILE = Path(__file__).parent.parent / "data" / "deletion_log.txt"
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] {message}\n")
