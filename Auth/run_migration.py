import sqlite3
import sys
from pathlib import Path

def migrate():
    db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"

    if not db_path.exists():
        print(f"Database not found at {db_path}")
        return False

    print(f"Migrating database at {db_path}...")

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        # 1. 创建 user_permission_groups 表
        print("Creating user_permission_groups table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_permission_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                group_id INTEGER NOT NULL,
                created_at_ms INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES permission_groups(group_id) ON DELETE CASCADE,
                UNIQUE(user_id, group_id)
            )
        """)

        # 2. 迁移现有数据
        print("Migrating existing user-group relationships...")
        cursor.execute("""
            INSERT OR IGNORE INTO user_permission_groups (user_id, group_id, created_at_ms)
            SELECT user_id, group_id, created_at_ms
            FROM users
            WHERE group_id IS NOT NULL
        """)

        # 3. 创建索引
        print("Creating indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_upg_user_id
            ON user_permission_groups(user_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_upg_group_id
            ON user_permission_groups(group_id)
        """)

        conn.commit()

        # 显示统计信息
        cursor.execute("SELECT COUNT(*) FROM user_permission_groups")
        count = cursor.fetchone()[0]
        print(f"Migration completed! Migrated {count} user-group relationships.")

        # 显示现有数据
        cursor.execute("""
            SELECT u.username, u.group_id as old_group_id
            FROM users u
            WHERE u.group_id IS NOT NULL
            LIMIT 5
        """)
        print("\nSample users with permission groups:")
        for row in cursor.fetchall():
            print(f"  User: {row[0]}, group_id: {row[1]}")

        return True

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
