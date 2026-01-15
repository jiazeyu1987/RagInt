import sqlite3
import json

conn = sqlite3.connect('data/auth.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# 查询所有权限组
print('=== 所有权限组 ===')
cursor.execute('SELECT group_id, group_name, accessible_kbs, accessible_chats FROM permission_groups')
groups = cursor.fetchall()
for group in groups:
    kbs = json.loads(group['accessible_kbs'] or '[]')
    chats = json.loads(group['accessible_chats'] or '[]')
    print(f"\n权限组: {group['group_name']} (ID: {group['group_id']})")
    print(f"  可访问知识库 ({len(kbs)}个): {kbs}")
    print(f"  可访问聊天体 ({len(chats)}个): {chats}")

# 查询所有用户及其权限组
print('\n=== 所有用户及其权限组 ===')
cursor.execute('SELECT user_id, username, role, group_id FROM users')
users = cursor.fetchall()
for user in users:
    group_id = user['group_id']
    if group_id:
        cursor.execute('SELECT group_name FROM permission_groups WHERE group_id = ?', (group_id,))
        g = cursor.fetchone()
        group_name = g['group_name'] if g else '无'
    else:
        group_name = '未分配'
    print(f"User: {user['username']}, Role: {user['role']}, 权限组: {group_name} (ID: {group_id})")

# 测试RAGFlow知识库列表
print('\n=== RAGFlow知识库列表 ===')
try:
    import sys
    sys.path.insert(0, '.')
    from services.ragflow_service import RagflowService
    ragflow = RagflowService()
    datasets = ragflow.list_datasets()
    print(f'找到 {len(datasets)} 个知识库:')
    for ds in datasets:
        print(f'  - name: "{ds.get("name")}", id: "{ds.get("id")}"')
except Exception as e:
    print(f'获取知识库失败: {e}')
    import traceback
    traceback.print_exc()

conn.close()
