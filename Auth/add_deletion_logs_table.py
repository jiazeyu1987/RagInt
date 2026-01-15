import sqlite3
import os

# 数据库路径
db_path = os.path.join(os.path.dirname(__file__), "new_backend", "data", "auth.db")

print(f"正在更新数据库: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 检查表是否已存在
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deletion_logs'")
exists = cursor.fetchone()

if exists:
    print("[INFO] deletion_logs 表已存在，跳过创建")
else:
    print("[INFO] 创建 deletion_logs 表...")

    # 创建 deletion_logs 表
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

    print("[OK] deletion_logs 表创建成功")

conn.commit()
conn.close()

print("[OK] 数据库更新完成")
