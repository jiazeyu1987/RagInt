import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

print("Checking user status...")
print("-" * 60)

# Check all users
cursor.execute("""
    SELECT user_id, username, email, role, status, group_id
    FROM users
""")
print("User ID | Username | Email | Role | Status | Group ID")
print("-" * 90)

users = cursor.fetchall()
for user in users:
    print(f"{user[0][:20]} | {user[1][:15]} | {str(user[2])[:15] if user[2] else 'None':<15} | {user[3][:10]} | {user[4][:10]} | {user[5]}")

print(f"\nTotal users: {len(users)}")

# Fix inactive users
cursor.execute("SELECT user_id, username, status FROM users WHERE status != 'active'")
inactive = cursor.fetchall()

if inactive:
    print(f"\n⚠️  Found {len(inactive)} non-active users")
    print("Setting all users to 'active' status...")

    cursor.execute("UPDATE users SET status = 'active' WHERE status != 'active'")
    conn.commit()

    print("✅ Done! All users are now active.")
else:
    print("\n✅ All users are already active!")

conn.close()

print("\nYou can now try logging in again.")
