"""
数据迁移脚本：为现有用户授予知识库权限

执行方式：
    python -m migrations.migrate_user_kb_permissions

功能：
1. 为所有管理员用户授予所有RAGFlow知识库权限
2. 为现有审核员、操作员、查看者授予默认知识库（"展厅"）权限
"""

import sys
import os
from pathlib import Path

# 添加父目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.user_store import UserStore
from services.user_kb_permission_store import UserKbPermissionStore
from services.ragflow_service import RagflowService


def migrate_user_permissions(db_path: str = None):
    """
    迁移现有用户的知识库权限
    """
    print("\n" + "=" * 60)
    print("开始迁移用户知识库权限...")
    print("=" * 60 + "\n")

    # 初始化服务
    user_store = UserStore(db_path=db_path)
    permission_store = UserKbPermissionStore(db_path=db_path)
    ragflow_service = RagflowService()

    # 获取所有知识库列表
    print("[1/3] 获取RAGFlow知识库列表...")
    try:
        datasets = ragflow_service.list_datasets()
        all_kb_ids = [ds['name'] for ds in datasets] if datasets else ["展厅"]
        print(f"      找到 {len(all_kb_ids)} 个知识库: {', '.join(all_kb_ids)}")
    except Exception as e:
        print(f"      警告: 无法连接RAGFlow，使用默认知识库列表 ['展厅']")
        all_kb_ids = ["展厅"]

    # 获取所有用户
    print("\n[2/3] 获取现有用户列表...")
    users = user_store.list_users()
    print(f"      找到 {len(users)} 个用户")

    # 系统用户ID（用于标记由系统授予的权限）
    system_user_id = "system"

    # 统计
    stats = {
        "admin": 0,
        "reviewer": 0,
        "operator": 0,
        "viewer": 0,
        "guest": 0,
        "total_permissions": 0
    }

    # 为每个用户授予权限
    print("\n[3/3] 授予知识库权限...")
    for user in users:
        if user.role == "admin":
            # 管理员：授予所有知识库权限
            for kb_id in all_kb_ids:
                permission_store.grant_permission(user.user_id, kb_id, system_user_id)
                stats["total_permissions"] += 1
            stats["admin"] += 1
            print(f"      [管理员] {user.username} -> 所有知识库 ({len(all_kb_ids)}个)")

        elif user.role in ["reviewer", "operator", "viewer"]:
            # 审核员、操作员、查看者：授予默认知识库权限
            default_kb = "展厅"
            permission_store.grant_permission(user.user_id, default_kb, system_user_id)
            stats["total_permissions"] += 1
            stats[user.role] += 1
            print(f"      [{user.role}] {user.username} -> {default_kb}")

        elif user.role == "guest":
            # 访客：默认不授予任何权限
            stats["guest"] += 1
            print(f"      [guest] {user.username} -> 无权限")

    # 输出统计
    print("\n" + "=" * 60)
    print("迁移完成！")
    print("=" * 60)
    print(f"\n统计信息:")
    print(f"  - 管理员用户: {stats['admin']} 人")
    print(f"  - 审核员用户: {stats['reviewer']} 人")
    print(f"  - 操作员用户: {stats['operator']} 人")
    print(f"  - 查看者用户: {stats['viewer']} 人")
    print(f"  - 访客用户: {stats['guest']} 人")
    print(f"  - 总权限授予数: {stats['total_permissions']} 条")
    print("\n注意事项:")
    print("  1. 管理员自动拥有所有知识库的访问权限")
    print("  2. 其他角色默认仅拥有'展厅'知识库权限")
    print("  3. 管理员可以在用户管理页面为每个用户配置具体权限")
    print("  4. 可以通过批量配置功能为多个用户同时授权")
    print("\n" + "=" * 60 + "\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="迁移现有用户的知识库权限"
    )
    parser.add_argument(
        "--db-path",
        help="数据库文件路径（默认：new_backend/data/auth.db）",
        default=None
    )

    args = parser.parse_args()

    try:
        migrate_user_permissions(args.db_path)
    except Exception as e:
        print(f"\n错误: 迁移失败 - {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
