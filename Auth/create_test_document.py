"""
创建测试知识库文档
"""
import sqlite3
import os
import uuid
import time
from pathlib import Path

# 数据库路径
DB_PATH = Path("new_backend/data/auth.db")

def create_test_documents():
    """创建测试文档"""

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 获取 admin 用户 ID
    cursor.execute("SELECT user_id FROM users WHERE username = 'admin'")
    result = cursor.fetchone()
    if not result:
        print("Error: Admin user not found")
        return

    admin_id = result[0]

    # 创建测试文档
    test_docs = [
        {
            "filename": "test_document_1.txt",
            "content": "这是第一个测试文档的内容。",
            "mime_type": "text/plain"
        },
        {
            "filename": "test_document_2.txt",
            "content": "这是第二个测试文档的内容，用于审核功能测试。",
            "mime_type": "text/plain"
        },
        {
            "filename": "test_pdf.pdf",
            "content": "PDF 测试文档内容",
            "mime_type": "application/pdf"
        }
    ]

    # 创建上传目录
    upload_dir = Path("new_backend/data/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)

    print(f"Creating {len(test_docs)} test documents...")

    for i, doc_data in enumerate(test_docs, 1):
        # 创建文件
        unique_filename = f"{uuid.uuid4()}_{doc_data['filename']}"
        file_path = upload_dir / unique_filename

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(doc_data['content'])

        file_size = len(doc_data['content'].encode('utf-8'))

        # 插入数据库
        doc_id = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)

        status = "pending" if i <= 2 else "approved"

        cursor.execute("""
            INSERT INTO kb_documents
            (doc_id, filename, file_path, file_size, mime_type, uploaded_by, status, uploaded_at_ms, kb_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            doc_id,
            doc_data['filename'],
            str(file_path),
            file_size,
            doc_data['mime_type'],
            admin_id,
            status,
            now_ms,
            "展厅"
        ))

        print(f"[{i}] Created: {doc_data['filename']} (status: {status})")

    conn.commit()
    conn.close()

    print("\n" + "="*50)
    print("Test documents created successfully!")
    print("="*50)

    # 显示统计
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT status, COUNT(*) FROM kb_documents GROUP BY status")
    stats = cursor.fetchall()
    print("\nDocument statistics:")
    for status, count in stats:
        print(f"  - {status}: {count}")
    conn.close()

if __name__ == "__main__":
    print("="*50)
    print("Creating test knowledge base documents...")
    print("="*50)

    if not DB_PATH.exists():
        print(f"Error: Database not found: {DB_PATH}")
        exit(1)

    create_test_documents()
