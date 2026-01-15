#!/usr/bin/env python3
"""
增强型权限组系统迁移脚本
将权限组升级为包含资源配置和细粒度操作权限
"""
import sys
import sqlite3
import json
from pathlib import Path


def migrate_database():
    """执行数据库迁移"""
    script_dir = Path(__file__).parent.parent
    db_path = script_dir / "data" / "auth.db"

    if not db_path.exists():
        print(f"错误: 数据库文件不存在: {db_path}")
        return False

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        print("开始增强型权限组系统迁移...")

        # 1. 检查表是否已存在，如果存在先备份并重建
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='permission_groups'
        """)

        if cursor.fetchone():
            print("检测到旧的权限组表，正在备份...")

            # 备份现有数据
            cursor.execute("ALTER TABLE permission_groups RENAME TO permission_groups_old")
            cursor.execute("ALTER TABLE group_permissions RENAME TO group_permissions_old")

            print("旧表已备份为 permission_groups_old 和 group_permissions_old")

        # 2. 创建新的权限组表（增强版）
        print("创建增强版 permission_groups 表...")
        cursor.execute("""
            CREATE TABLE permission_groups (
                group_id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_name TEXT NOT NULL UNIQUE,
                description TEXT,
                is_system INTEGER DEFAULT 0,

                -- 资源配置（JSON格式）
                accessible_kbs TEXT DEFAULT '[]',
                accessible_chats TEXT DEFAULT '[]',

                -- 操作权限
                can_upload INTEGER DEFAULT 0,
                can_review INTEGER DEFAULT 0,
                can_download INTEGER DEFAULT 1,
                can_delete INTEGER DEFAULT 0,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 3. 创建索引
        print("创建索引...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_group_id
            ON users(group_id)
        """)

        # 4. 插入默认权限组
        print("插入默认权限组...")

        # 管理员组（所有权限）
        cursor.execute("""
            INSERT INTO permission_groups (
                group_name, description, is_system,
                accessible_kbs, accessible_chats,
                can_upload, can_review, can_download, can_delete
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            'admin',
            '系统管理员，拥有所有权限',
            1,
            json.dumps([]),  # 空数组表示所有（由代码判断）
            json.dumps([]),
            1, 1, 1, 1
        ))
        admin_group_id = cursor.lastrowid

        # 审核员组
        cursor.execute("""
            INSERT INTO permission_groups (
                group_name, description, is_system,
                accessible_kbs, accessible_chats,
                can_upload, can_review, can_download, can_delete
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            'reviewer',
            '文档审核员，可以审核和下载文档',
            1,
            json.dumps([]),
            json.dumps([]),
            0, 1, 1, 0
        ))
        reviewer_group_id = cursor.lastrowid

        # 操作员组
        cursor.execute("""
            INSERT INTO permission_groups (
                group_name, description, is_system,
                accessible_kbs, accessible_chats,
                can_upload, can_review, can_download, can_delete
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            'operator',
            '操作员，可以上传、下载和删除文档',
            1,
            json.dumps([]),
            json.dumps([]),
            1, 0, 1, 1
        ))
        operator_group_id = cursor.lastrowid

        # 查看者组
        cursor.execute("""
            INSERT INTO permission_groups (
                group_name, description, is_system,
                accessible_kbs, accessible_chats,
                can_upload, can_review, can_download, can_delete
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            'viewer',
            '查看者，只能查看和下载文档',
            1,
            json.dumps([]),
            json.dumps([]),
            0, 0, 1, 0
        ))
        viewer_group_id = cursor.lastrowid

        # 访客组
        cursor.execute("""
            INSERT INTO permission_groups (
                group_name, description, is_system,
                accessible_kbs, accessible_chats,
                can_upload, can_review, can_download, can_delete
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            'guest',
            '访客，只能查看文档',
            1,
            json.dumps([]),
            json.dumps([]),
            0, 0, 0, 0
        ))
        guest_group_id = cursor.lastrowid

        # 5. 迁移现有用户到新权限组
        print("迁移现有用户到新权限组...")
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

        # 6. 清理旧表（如果需要保留数据，可以注释掉这部分）
        # cursor.execute("DROP TABLE IF EXISTS group_permissions_old")
        # cursor.execute("DROP TABLE IF EXISTS permission_groups_old")

        conn.commit()
        print("✓ 增强型权限组系统迁移完成！")
        print("\n新的权限组特性：")
        print("  ✓ 可配置可访问的知识库列表")
        print("  ✓ 可配置可访问的聊天体列表")
        print("  ✓ 细粒度操作权限（上传、审核、下载、删除）")
        print("  ✓ 支持自定义权限组")
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
