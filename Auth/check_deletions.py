import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

print("=" * 80)
print("检查 deletion_logs 表状态")
print("=" * 80)

# 1. 检查表是否存在
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deletion_logs'")
exists = cursor.fetchone()

if not exists:
    print("[ERROR] deletion_logs 表不存在！")
    exit(1)

print("[OK] deletion_logs 表已存在")

# 2. 查询记录数
cursor.execute("SELECT COUNT(*) FROM deletion_logs")
count = cursor.fetchone()[0]
print(f"[INFO] 当前删除记录数: {count}")

# 3. 查询所有记录
cursor.execute("""
    SELECT id, doc_id, filename, kb_id, deleted_by,
           deleted_at_ms, original_uploader, original_reviewer
    FROM deletion_logs
    ORDER BY deleted_at_ms DESC
""")
rows = cursor.fetchall()

if rows:
    print(f"\n[INFO] 删除记录详情:")
    for row in rows:
        print(f"  - ID: {row[0]}")
        print(f"    文件: {row[2]}")
        print(f"    知识库: {row[3]}")
        print(f"    删除者: {row[4]}")
        print(f"    删除时间: {row[5]}")
        print(f"    原上传者: {row[6]}")
        print(f"    原审核者: {row[7]}")
        print()
else:
    print("[INFO] 暂无删除记录")
    print("[提示] 请在前端删除一个文档，然后刷新此页面查看")

# 4. 检查现有文档数量
cursor.execute("SELECT COUNT(*) FROM kb_documents")
doc_count = cursor.fetchone()[0]
print(f"[INFO] 当前数据库中的文档数: {doc_count}")

if doc_count > 0:
    cursor.execute("SELECT doc_id, filename, kb_id FROM kb_documents LIMIT 5")
    docs = cursor.fetchall()
    print(f"[INFO] 现有文档（前5条）:")
    for doc in docs:
        print(f"  - {doc[1]} (ID: {doc[0]}, KB: {doc[2]})")

conn.close()
print("=" * 80)
