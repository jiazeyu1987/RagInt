"""
迁移脚本：将旧后端的数据迁移到新后端
"""
import sqlite3
import shutil
from pathlib import Path

# 数据库路径
OLD_DB = Path("backend/data/auth.db")
NEW_DB = Path("new_backend/data/auth.db")

def migrate_data():
    """迁移用户和知识库文档数据"""

    # 备份新数据库
    if NEW_DB.exists():
        shutil.copy(NEW_DB, NEW_DB.with_suffix('.db.backup'))
        print(f"[OK] 已备份新数据库: {NEW_DB.with_suffix('.db.backup')}")

    # 连接数据库
    old_conn = sqlite3.connect(OLD_DB)
    new_conn = sqlite3.connect(NEW_DB)
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    try:
        # 迁移用户数据
        print("\n[1/2] 迁移用户数据...")
        old_cursor.execute("SELECT user_id, username, password_hash, email, role, status, created_at_ms, last_login_at_ms, created_by FROM users")
        users = old_cursor.fetchall()

        for user in users:
            try:
                new_cursor.execute("""
                    INSERT OR IGNORE INTO users
                    (user_id, username, password_hash, email, role, status, created_at_ms, last_login_at_ms, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, user)
            except Exception as e:
                print(f"  跳过用户 {user[1]}: {e}")

        new_conn.commit()
        print(f"[OK] 已迁移 {len(users)} 个用户")

        # 迁移文档数据
        print("\n[2/2] 迁移文档数据...")
        old_cursor.execute("""
            SELECT doc_id, filename, file_path, file_size, mime_type,
                   uploaded_by, status, uploaded_at_ms, reviewed_by,
                   reviewed_at_ms, review_notes, ragflow_doc_id, kb_id
            FROM kb_documents
        """)
        docs = old_cursor.fetchall()

        for doc in docs:
            try:
                new_cursor.execute("""
                    INSERT OR IGNORE INTO kb_documents
                    (doc_id, filename, file_path, file_size, mime_type,
                     uploaded_by, status, uploaded_at_ms, reviewed_by,
                     reviewed_at_ms, review_notes, ragflow_doc_id, kb_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, doc)
            except Exception as e:
                print(f"  跳过文档 {doc[1]}: {e}")

        new_conn.commit()
        print(f"[OK] 已迁移 {len(docs)} 个文档")

        # 复制上传的文件
        print("\n[3/3] 复制上传文件...")
        old_upload_dir = Path("backend/data/uploads")
        new_upload_dir = Path("new_backend/data/uploads")

        if old_upload_dir.exists():
            new_upload_dir.mkdir(parents=True, exist_ok=True)
            copied = 0
            for file in old_upload_dir.iterdir():
                if file.is_file():
                    dest = new_upload_dir / file.name
                    shutil.copy2(file, dest)
                    copied += 1
            print(f"[OK] 已复制 {copied} 个文件")
        else:
            print("[INFO] 旧上传目录不存在，跳过文件复制")

        print("\n" + "="*50)
        print("✅ 数据迁移完成！")
        print("="*50)

        # 显示统计
        new_cursor.execute("SELECT COUNT(*) FROM users")
        user_count = new_cursor.fetchone()[0]
        new_cursor.execute("SELECT COUNT(*) FROM kb_documents")
        doc_count = new_cursor.fetchone()[0]

        print(f"\n新数据库统计:")
        print(f"  - 用户数: {user_count}")
        print(f"  - 文档数: {doc_count}")

    except Exception as e:
        print(f"\n❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        old_conn.close()
        new_conn.close()

if __name__ == "__main__":
    print("="*50)
    print("开始迁移旧后端数据到新后端...")
    print("="*50)

    if not OLD_DB.exists():
        print(f"❌ 旧数据库不存在: {OLD_DB}")
        exit(1)

    if not NEW_DB.exists():
        print(f"❌ 新数据库不存在: {NEW_DB}")
        print("请先运行: cd new_backend/database && python init_db.py")
        exit(1)

    migrate_data()
