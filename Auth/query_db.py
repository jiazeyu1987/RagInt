import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

print("=" * 80)
print("数据库检查")
print("=" * 80)

# 1. 检查 deletion_logs 表是否存在
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deletion_logs'")
table_exists = cursor.fetchone()

if table_exists:
    print("[✓] deletion_logs 表存在")

    # 2. 查询删除记录数量
    cursor.execute("SELECT COUNT(*) FROM deletion_logs")
    deletion_count = cursor.fetchone()[0]
    print(f"[INFO] 删除记录数量: {deletion_count}")

    if deletion_count > 0:
        cursor.execute("SELECT * FROM deletion_logs")
        rows = cursor.fetchall()
        print(f"\n[INFO] 删除记录详情:")
        for row in rows:
            print(f"  {row}")
    else:
        print("[INFO] deletion_logs 表是空的 - 还没有删除任何文档")
else:
    print("[✗] deletion_logs 表不存在")

# 3. 查询当前文档数量
cursor.execute("SELECT COUNT(*) FROM kb_documents")
doc_count = cursor.fetchone()[0]
print(f"[INFO] kb_documents 表中的文档数量: {doc_count}")

# 4. 列出所有文档
if doc_count > 0:
    cursor.execute("SELECT doc_id, filename, kb_id, status FROM kb_documents")
    docs = cursor.fetchall()
    print(f"\n[INFO] 当前文档列表:")
    for doc in docs:
        print(f"  - {doc[1]} (ID: {doc[0][:8]}..., KB: {doc[2]}, 状态: {doc[3]})")

conn.close()
print("=" * 80)
