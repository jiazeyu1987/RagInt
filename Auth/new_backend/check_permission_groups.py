import sqlite3
import json

conn = sqlite3.connect('data/auth.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# 查询所有权限组
print('=== 权限组列表 ===')
cursor.execute('SELECT group_id, group_name, description, accessible_kbs, accessible_chats FROM permission_groups')
groups = cursor.fetchall()

for group in groups:
    print(f"\n权限组ID: {group['group_id']}")
    print(f"名称: {group['group_name']}")
    print(f"描述: {group['description']}")
    kbs = json.loads(group['accessible_kbs'] or '[]')
    chats = json.loads(group['accessible_chats'] or '[]')
    print(f"可访问知识库 ({len(kbs)}个): {kbs}")
    print(f"可访问聊天体 ({len(chats)}个): {chats}")

# 查询用户及其权限组
print('\n=== 用户列表 ===')
cursor.execute('SELECT user_id, username, role, group_id FROM users')
users = cursor.fetchall()

for user in users:
    group_name = '无'
    if user['group_id']:
        cursor.execute('SELECT group_name FROM permission_groups WHERE group_id = ?', (user['group_id'],))
        g = cursor.fetchone()
        if g:
            group_name = g['group_name']
    print(f"用户: {user['username']}, Role: {user['role']}, 权限组: {group_name} (ID: {user['group_id']})")

# 测试RAGFlow知识库列表
print('\n=== RAGFlow知识库列表 ===')
try:
    from services.ragflow_service import RagflowService
    ragflow = RagflowService()
    datasets = ragflow.list_datasets()
    print(f"找到 {len(datasets)} 个知识库:")
    for ds in datasets:
        print(f"  - ID: {ds.get('id')}, Name: {ds.get('name')}")
except Exception as e:
    print(f"获取知识库失败: {e}")

conn.close()
