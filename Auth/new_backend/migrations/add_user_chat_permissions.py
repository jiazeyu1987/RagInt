"""
迁移脚本：添加 user_chat_permissions 表

运行方式：
    cd new_backend
    python migrations/add_user_chat_permissions.py
"""
import sqlite3
import sys
from pathlib import Path


def migrate(db_path: str = None):
    """
    添加 user_chat_permissions 表
    """
    if db_path is None:
        script_dir = Path(__file__).parent.parent
        db_path = script_dir / "data" / "auth.db"

    db_path = Path(db_path)

    if not db_path.exists():
        print(f"[ERROR] Database not found: {db_path}")
        return False

    print(f"[INFO] Migrating database: {db_path}")

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        # 检查表是否已存在
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='user_chat_permissions'
        """)

        if cursor.fetchone():
            print("[INFO] Table 'user_chat_permissions' already exists, skipping...")
            return True

        # 创建 user_chat_permissions 表
        cursor.execute("""
            CREATE TABLE user_chat_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                granted_by TEXT NOT NULL,
                granted_at_ms INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (granted_by) REFERENCES users(user_id),
                UNIQUE(user_id, chat_id)
            )
        """)

        # 创建索引
        cursor.execute("CREATE INDEX idx_user_chat_user ON user_chat_permissions(user_id)")
        cursor.execute("CREATE INDEX idx_user_chat_chat ON user_chat_permissions(chat_id)")

        conn.commit()

        print("[OK] Table 'user_chat_permissions' created successfully")
        print("[OK] Indexes created successfully")

        return True

    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Add user_chat_permissions table")
    parser.add_argument("--db-path", help="Path to database file")

    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("Migration: Add user_chat_permissions table")
    print("=" * 60 + "\n")

    success = migrate(args.db_path)

    print("\n" + "=" * 60)
    if success:
        print("Migration completed successfully!")
        print("=" * 60 + "\n")
        sys.exit(0)
    else:
        print("Migration FAILED!")
        print("=" * 60 + "\n")
        sys.exit(1)
