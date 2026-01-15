"""
迁移脚本：添加 chat_sessions 表

运行方式：
    cd new_backend
    python migrations/add_chat_sessions.py
"""
import sqlite3
import sys
from pathlib import Path


def migrate(db_path: str = None):
    """
    添加 chat_sessions 表
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
            WHERE type='table' AND name='chat_sessions'
        """)

        if cursor.fetchone():
            print("[INFO] Table 'chat_sessions' already exists, skipping...")
            return True

        # 创建 chat_sessions 表
        cursor.execute("""
            CREATE TABLE chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                deleted_at_ms INTEGER,
                deleted_by TEXT,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (deleted_by) REFERENCES users(user_id),
                UNIQUE(session_id, chat_id)
            )
        """)

        # 创建索引
        cursor.execute("CREATE INDEX idx_chat_sessions_session ON chat_sessions(session_id)")
        cursor.execute("CREATE INDEX idx_chat_sessions_chat ON chat_sessions(chat_id)")
        cursor.execute("CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id)")
        cursor.execute("CREATE INDEX idx_chat_sessions_deleted ON chat_sessions(is_deleted)")

        conn.commit()

        print("[OK] Table 'chat_sessions' created successfully")
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

    parser = argparse.ArgumentParser(description="Add chat_sessions table")
    parser.add_argument("--db-path", help="Path to database file")

    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("Migration: Add chat_sessions table")
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
