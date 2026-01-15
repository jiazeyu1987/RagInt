import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

print("=" * 80)
print("LOGIN ISSUE DIAGNOSTIC")
print("=" * 80)

# Check all users in detail
cursor.execute("""
    SELECT user_id, username, password_hash, email, role, group_id, status
    FROM users
""")
print("\n1. ALL USERS IN DATABASE:")
print("-" * 80)
print(f"{'Username':<20} {'Role':<15} {'Status':<10} {'Group ID':<10}")
print("-" * 80)

users = cursor.fetchall()
has_inactive = False
for user in users:
    username = user[1]
    role = user[4]
    status = user[6]
    group_id = user[5]

    status_indicator = "✅" if status == "active" else "❌"
    print(f"{username:<20} {role:<15} {status:<10} {str(group_id):<10} {status_indicator}")

    if status != "active":
        has_inactive = True

# Check specific user
print("\n2. CHECKING SPECIFIC USER (admin):")
print("-" * 80)
cursor.execute("""
    SELECT username, status, role, password_hash
    FROM users
    WHERE username = 'admin'
""")
admin_user = cursor.fetchone()
if admin_user:
    print(f"Username: {admin_user[0]}")
    print(f"Status: {admin_user[1]} {'✅' if admin_user[1] == 'active' else '❌ NOT ACTIVE'}")
    print(f"Role: {admin_user[2]}")
    print(f"Has password hash: {'Yes' if admin_user[3] else 'No'}")
else:
    print("❌ Admin user NOT FOUND in database!")

# Fix if needed
if has_inactive:
    print("\n3. FIXING INACTIVE USERS:")
    print("-" * 80)
    print("Setting all users to 'active' status...")

    cursor.execute("UPDATE users SET status = 'active'")
    conn.commit()

    print("✅ Fixed! Verifying...")
    cursor.execute("SELECT username, status FROM users")
    all_active = all(user[1] == "active" for user in cursor.fetchall())

    if all_active:
        print("✅ All users are now active!")
    else:
        print("❌ Some users are still not active")
else:
    print("\n3. STATUS CHECK:")
    print("-" * 80)
    print("✅ All users already have 'active' status")
    print("\n⚠️  If you're still getting 403 errors, the issue might be:")
    print("   - Wrong username/password")
    print("   - Backend needs to be restarted")
    print("   - Frontend sending request to wrong endpoint")

conn.close()

print("\n" + "=" * 80)
print("NEXT STEPS:")
print("=" * 80)
print("1. If users were fixed, restart the backend server")
print("2. Clear your browser cache/cookies")
print("3. Try logging in with username: admin")
print("=" * 80)
