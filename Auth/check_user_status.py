import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

print("Checking user status in database...")
print("-" * 60)

# Check all users
cursor.execute("""
    SELECT user_id, username, email, role, status, group_id
    FROM users
""")
print("User ID | Username | Email | Role | Status | Group ID")
print("-" * 80)

users = cursor.fetchall()
for user in users:
    print(f"{user[0]} | {user[1]} | {user[2]} | {user[3]} | {user[4]} | {user[5]}")

print(f"\nTotal users: {len(users)}")

# Check if there are any inactive users
cursor.execute("SELECT username, status FROM users WHERE status != 'active'")
inactive = cursor.fetchall()
if inactive:
    print("\n⚠️  Non-active users found:")
    for username, status in inactive:
        print(f"  - {username}: status={status}")

conn.close()
