import sqlite3
from pathlib import Path

db_path = Path("new_backend/data/auth.db")
print(f"Database: {db_path}")
print(f"Exists: {db_path.exists()}")
print()

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# 检查用户表结构
cursor.execute("PRAGMA table_info(users)")
print("Users table structure:")
for col in cursor.fetchall():
    print(f"  {col[1]}: {col[2]}")
print()

# 检查所有用户
cursor.execute("SELECT rowid, username, status FROM users")
print("Users in database:")
users = cursor.fetchall()
if not users:
    print("  NO USERS FOUND!")
else:
    for row in users:
        rowid, username, status = row
        print(f"  [{rowid}] {username}: status='{status}'")
print()

# 强制修改
print("Fixing all users to 'active'...")
cursor.execute("UPDATE users SET status = 'active'")
affected = cursor.rowcount
print(f"Updated {affected} rows")
conn.commit()
print()

# 验证
cursor.execute("SELECT username, status FROM users")
print("After fix:")
for row in cursor.fetchall():
    print(f"  {row[0]}: status='{row[1]}'")

conn.close()
print("\nDone. Now RESTART the backend server!")
