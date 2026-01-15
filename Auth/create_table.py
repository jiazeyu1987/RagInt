import sqlite3
import sys

try:
    conn = sqlite3.connect('new_backend/data/auth.db')
    cursor = conn.cursor()

    # 检查表是否已存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deletion_logs'")
    exists = cursor.fetchone()

    if exists:
        print("[INFO] deletion_logs 表已存在")
    else:
        # 创建表
        cursor.execute("""
            CREATE TABLE deletion_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                kb_id TEXT NOT NULL,
                deleted_by TEXT NOT NULL,
                deleted_at_ms INTEGER NOT NULL,
                original_uploader TEXT,
                original_reviewer TEXT,
                ragflow_doc_id TEXT,
                FOREIGN KEY (deleted_by) REFERENCES users(user_id)
            )
        """)

        # 创建索引
        cursor.execute("CREATE INDEX idx_deletion_logs_kb ON deletion_logs(kb_id)")
        cursor.execute("CREATE INDEX idx_deletion_logs_time ON deletion_logs(deleted_at_ms)")

        conn.commit()
        print("[SUCCESS] deletion_logs 表创建成功")

    # 验证表已创建
    cursor.execute("SELECT count(*) FROM deletion_logs")
    count = cursor.fetchone()[0]
    print(f"[INFO] deletion_logs 表中当前有 {count} 条记录")

    conn.close()

except Exception as e:
    print(f"[ERROR] 创建表失败: {e}")
    sys.exit(1)
