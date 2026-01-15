"""
迁移数据库支持用户分配多个权限组

这个脚本会：
1. 创建 user_permission_groups 表（用户-权限组多对多关系）
2. 将现有的 group_id 迁移到新表
3. 修改 user_store.py 支持多个权限组
"""

import sqlite3
import os
from pathlib import Path

def migrate():
    db_path = Path(__file__).parent.parent / "data" / "auth.db"

    if not db_path.exists():
        print(f"Database not found at {db_path}")
        return

    print(f"Migrating database at {db_path}...")

    conn = sqlite3.connect(db_path)
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
            SELECT u.username, u.group_id as old_group_id,
                   (SELECT group_id FROM user_permission_groups WHERE user_id = u.user_id)
            FROM users u
            WHERE u.group_id IS NOT NULL
            LIMIT 5
        """)
        print("\nSample migrated data:")
        for row in cursor.fetchall():
            print(f"  User: {row[0]}, Old group_id: {row[1]}, New relationship: {row[2]}")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()

    print("\nNext steps:")
    print("1. Update user_store.py to use user_permission_groups table")
    print("2. Update models/user.py to support group_ids")
    print("3. Update frontend to support multiple permission groups")

if __name__ == "__main__":
    migrate()
