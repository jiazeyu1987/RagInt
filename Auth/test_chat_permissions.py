"""
测试脚本：检查聊天助手权限功能
"""
import sys
from pathlib import Path

# 添加 new_backend 到路径
sys.path.insert(0, str(Path(__file__).parent / "new_backend"))

from services.user_chat_permission_store import UserChatPermissionStore
from services.user_store import UserStore

def test_chat_permissions():
    db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"

    if not db_path.exists():
        print(f"[ERROR] Database not found: {db_path}")
        return False

    print(f"[INFO] Using database: {db_path}")

    # 初始化 stores
    chat_permission_store = UserChatPermissionStore(db_path=str(db_path))
    user_store = UserStore(db_path=str(db_path))

    # 获取第一个非管理员用户
    users = user_store.list_users()
    test_user = None
    for user in users:
        if user.role != "admin":
            test_user = user
            break

    if not test_user:
        print("[ERROR] No non-admin user found")
        return False

    print(f"[INFO] Testing with user: {test_user.username} ({test_user.user_id})")

    # 测试1: 授予权限
    print("\n[TEST 1] Granting chat permission...")
    test_chat_id = "test_chat_123"
    try:
        permission = chat_permission_store.grant_permission(
            user_id=test_user.user_id,
            chat_id=test_chat_id,
            granted_by="admin"
        )
        print(f"[OK] Permission granted: {permission}")
    except Exception as e:
        print(f"[ERROR] Failed to grant permission: {e}")
        return False

    # 测试2: 查询用户权限
    print("\n[TEST 2] Getting user chat permissions...")
    try:
        chat_ids = chat_permission_store.get_user_chats(test_user.user_id)
        print(f"[OK] User's chat IDs: {chat_ids}")
        if test_chat_id not in chat_ids:
            print(f"[ERROR] Expected {test_chat_id} in {chat_ids}")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to get user chats: {e}")
        return False

    # 测试3: 检查权限
    print("\n[TEST 3] Checking permission...")
    try:
        has_permission = chat_permission_store.check_permission(
            user_id=test_user.user_id,
            chat_id=test_chat_id
        )
        print(f"[OK] Has permission: {has_permission}")
        if not has_permission:
            print(f"[ERROR] Expected True")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to check permission: {e}")
        return False

    # 测试4: 撤销权限
    print("\n[TEST 4] Revoking permission...")
    try:
        success = chat_permission_store.revoke_permission(
            user_id=test_user.user_id,
            chat_id=test_chat_id
        )
        print(f"[OK] Permission revoked: {success}")
        if not success:
            print(f"[ERROR] Expected True")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to revoke permission: {e}")
        return False

    # 测试5: 验证撤销后权限不存在
    print("\n[TEST 5] Verifying permission was revoked...")
    try:
        chat_ids = chat_permission_store.get_user_chats(test_user.user_id)
        print(f"[OK] User's chat IDs after revoke: {chat_ids}")
        if test_chat_id in chat_ids:
            print(f"[ERROR] Expected {test_chat_id} to be removed")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to get user chats: {e}")
        return False

    print("\n" + "=" * 60)
    print("All tests PASSED!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = test_chat_permissions()
    sys.exit(0 if success else 1)
