import sqlite3
import json
import sys
sys.path.insert(0, '.')

from services.ragflow_service import RagflowService

conn = sqlite3.connect('data/auth.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("=" * 80)
print("快速检查：用户、权限组、知识库")
print("=" * 80)

# 1. 获取所有非管理员用户
print("\n1. 非管理员用户:")
cursor.execute('SELECT user_id, username, role, group_id FROM users WHERE role != "admin"')
users = cursor.fetchall()
for user in users:
    print(f"  - {user['username']}: role={user['role']}, group_id={user['group_id']}")

# 2. 获取权限组配置
print("\n2. 权限组配置:")
cursor.execute('SELECT group_id, group_name, accessible_kbs FROM permission_groups')
groups = cursor.fetchall()
for group in groups:
    kbs = json.loads(group['accessible_kbs'] or '[]')
    print(f"  - {group['group_name']} (ID: {group['group_id']}): {kbs}")

# 3. 获取RAGFlow知识库
print("\n3. RAGFlow知识库:")
try:
    ragflow = RagflowService()
    datasets = ragflow.list_datasets()
    for ds in datasets:
        print(f"  - name: '{ds.get('name')}', id: '{ds.get('id')}'")
except Exception as e:
    print(f"  获取失败: {e}")

# 4. 检查用户的 accessible_kbs
print("\n4. 模拟 /api/me/kbs 返回数据:")
for user in users:
    print(f"\n  用户: {user['username']}")
    if not user['group_id']:
        print(f"    → 无 group_id, 返回 []")
        continue

    cursor.execute('SELECT * FROM permission_groups WHERE group_id = ?', (user['group_id'],))
    group = cursor.fetchone()
    if not group:
        print(f"    → 权限组不存在, 返回 []")
        continue

    accessible_kbs = json.loads(group['accessible_kbs'] or '[]')
    print(f"    → 权限组: {group['group_name']}")
    print(f"    → accessible_kbs: {accessible_kbs}")

    if accessible_kbs and len(accessible_kbs) > 0:
        print(f"    → 返回配置的 KBs: {accessible_kbs}")
    else:
        print(f"    → accessible_kbs 为空, 尝试获取所有 KBs")
        try:
            ragflow = RagflowService()
            datasets = ragflow.list_datasets()
            all_kbs = [ds['name'] for ds in datasets]
            print(f"    → 返回所有 KBs: {all_kbs}")
        except Exception as e:
            print(f"    → 获取失败: {e}, 返回 []")

print("\n" + "=" * 80)
conn.close()
