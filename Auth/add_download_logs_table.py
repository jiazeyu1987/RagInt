import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"

print(f"正在更新数据库: {db_path}")

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# 检查表是否已存在
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='download_logs'")
exists = cursor.fetchone()

if exists:
    print("[INFO] download_logs 表已存在，跳过创建")
else:
    print("[INFO] 创建 download_logs 表...")

    # 创建 download_logs 表
    cursor.execute("""
        CREATE TABLE download_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            kb_id TEXT NOT NULL,
            downloaded_by TEXT NOT NULL,
            downloaded_at_ms INTEGER NOT NULL,
            ragflow_doc_id TEXT,
            is_batch BOOLEAN NOT NULL DEFAULT 0,
            FOREIGN KEY (downloaded_by) REFERENCES users(user_id)
        )
    """)

    # 创建索引
    cursor.execute("CREATE INDEX idx_download_logs_kb ON download_logs(kb_id)")
    cursor.execute("CREATE INDEX idx_download_logs_time ON download_logs(downloaded_at_ms)")
    cursor.execute("CREATE INDEX idx_download_logs_user ON download_logs(downloaded_by)")

    print("[OK] download_logs 表创建成功")

# 检查 deletion_logs 表是否存在（如果之前没有创建成功）
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deletion_logs'")
del_exists = cursor.fetchone()

if not del_exists:
    print("[INFO] 同时创建 deletion_logs 表...")

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
    cursor.execute("CREATE INDEX idx_deletion_logs_kb ON deletion_logs(kb_id)")
    cursor.execute("CREATE INDEX idx_deletion_logs_time ON deletion_logs(deleted_at_ms)")
    print("[OK] deletion_logs 表创建成功")

conn.commit()
conn.close()

print("[OK] 数据库更新完成")
