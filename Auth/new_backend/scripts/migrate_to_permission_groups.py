#!/usr/bin/env python3
"""
权限组系统迁移脚本
将基于角色的权限系统迁移到基于权限组的系统
"""
import sys
import sqlite3
from pathlib import Path

# 添加项目根目录到路径
script_dir = Path(__file__).parent.parent
sys.path.insert(0, str(script_dir))

from config import settings


def migrate_database():
    """执行数据库迁移"""
    db_path = Path(settings.DATABASE_PATH)

    if not db_path.exists():
        print(f"错误: 数据库文件不存在: {db_path}")
        return False

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        print("开始权限组系统迁移...")

        # 1. 检查表是否已存在
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='permission_groups'
        """)
        if cursor.fetchone():
            print("权限组表已存在，跳过创建")
        else:
            # 2. 创建权限组表
            print("创建 permission_groups 表...")
            cursor.execute("""
                CREATE TABLE permission_groups (
                    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    is_system INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 3. 创建权限组-权限关联表
            print("创建 group_permissions 表...")
            cursor.execute("""
                CREATE TABLE group_permissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id INTEGER NOT NULL,
                    permission TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (group_id) REFERENCES permission_groups(group_id) ON DELETE CASCADE,
                    UNIQUE(group_id, permission)
                )
            """)

            # 4. 添加用户表的group_id字段
            print("为 users 表添加 group_id 字段...")
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN group_id INTEGER")
            except sqlite3.OperationalError:
                print("  - 字段已存在，跳过")

            # 5. 创建索引
            print("创建索引...")
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_group_permissions_group_id
                ON group_permissions(group_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_users_group_id
                ON users(group_id)
            """)

            # 6. 插入默认权限组
            print("插入默认权限组...")

            # 管理员组
            cursor.execute("""
                INSERT INTO permission_groups (group_name, description, is_system)
                VALUES ('admin', '系统管理员，拥有所有权限', 1)
            """)
            admin_group_id = cursor.lastrowid

            # 审核员组
            cursor.execute("""
                INSERT INTO permission_groups (group_name, description, is_system)
                VALUES ('reviewer', '文档审核员，可以审核文档', 1)
            """)
            reviewer_group_id = cursor.lastrowid

            # 操作员组
            cursor.execute("""
                INSERT INTO permission_groups (group_name, description, is_system)
                VALUES ('operator', '操作员，可以上传和查看文档', 1)
            """)
            operator_group_id = cursor.lastrowid

            # 查看者组
            cursor.execute("""
                INSERT INTO permission_groups (group_name, description, is_system)
                VALUES ('viewer', '查看者，只能查看文档', 1)
            """)
            viewer_group_id = cursor.lastrowid

            # 访客组
            cursor.execute("""
                INSERT INTO permission_groups (group_name, description, is_system)
                VALUES ('guest', '访客，只能查看文档', 1)
            """)
            guest_group_id = cursor.lastrowid

            # 7. 为权限组分配权限
            print("为权限组分配权限...")

            # 审核员组权限
            reviewer_permissions = [
                'kb_documents:approve',
                'kb_documents:reject',
                'kb_documents:view',
                'users:view'
            ]
            for perm in reviewer_permissions:
                cursor.execute(
                    "INSERT INTO group_permissions (group_id, permission) VALUES (?, ?)",
                    (reviewer_group_id, perm)
                )

            # 操作员组权限
            operator_permissions = [
                'kb_documents:upload',
                'kb_documents:view',
                'kb_documents:delete'
            ]
            for perm in operator_permissions:
                cursor.execute(
                    "INSERT INTO group_permissions (group_id, permission) VALUES (?, ?)",
                    (operator_group_id, perm)
                )

            # 查看者组权限
            cursor.execute(
                "INSERT INTO group_permissions (group_id, permission) VALUES (?, ?)",
                (viewer_group_id, 'kb_documents:view')
            )

            # 访客组权限
            cursor.execute(
                "INSERT INTO group_permissions (group_id, permission) VALUES (?, ?)",
                (guest_group_id, 'kb_documents:view')
            )

            # 8. 迁移现有用户到权限组
            print("迁移现有用户到权限组...")
            cursor.execute("SELECT user_id, role FROM users")
            users = cursor.fetchall()

            role_to_group = {
                'admin': admin_group_id,
                'reviewer': reviewer_group_id,
                'operator': operator_group_id,
                'viewer': viewer_group_id,
                'guest': guest_group_id
            }

            for user_id, role in users:
                group_id = role_to_group.get(role)
                if group_id:
                    cursor.execute(
                        "UPDATE users SET group_id = ? WHERE user_id = ?",
                        (group_id, user_id)
                    )
                    print(f"  - 用户 {user_id}: {role} -> group_id={group_id}")

            conn.commit()
            print("✓ 数据库迁移完成！")
            return True

    except Exception as e:
        conn.rollback()
        print(f"✗ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    success = migrate_database()
    sys.exit(0 if success else 1)
