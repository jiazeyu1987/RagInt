# 检查并创建 deletion_logs 表
import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"
print(f"数据库路径: {db_path}")

if not db_path.exists():
    print(f"[ERROR] 数据库文件不存在: {db_path}")
    exit(1)

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# 检查表是否存在
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deletion_logs'")
exists = cursor.fetchone()

if exists:
    print("[OK] deletion_logs 表已存在")

    # 查询现有记录数
    cursor.execute("SELECT COUNT(*) FROM deletion_logs")
    count = cursor.fetchone()[0]
    print(f"[INFO] 当前删除记录数: {count}")

    if count > 0:
        cursor.execute("SELECT * FROM deletion_logs ORDER BY deleted_at_ms DESC LIMIT 5")
        rows = cursor.fetchall()
        print(f"[INFO] 最近的删除记录:")
        for row in rows:
            print(f"  - ID: {row[0]}, 文件: {row[2]}, KB: {row[3]}, 删除者: {row[4]}")
else:
    print("[INFO] deletion_logs 表不存在，正在创建...")

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
    print("[SUCCESS] deletion_logs 表创建成功！")

# 列出所有表
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = cursor.fetchall()
print(f"\n[INFO] 数据库中的所有表:")
for table in tables:
    print(f"  - {table[0]}")

conn.close()
