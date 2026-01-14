import sqlite3
from pathlib import Path

db_path = Path('data') / 'auth.db'

print(f"Database path: {db_path}")
print(f"Database exists: {db_path.exists()}")

if db_path.exists():
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute('SELECT username, role FROM users')
    users = cursor.fetchall()

    print("\n" + "="*50)
    print("Current users in database:")
    print("="*50)
    print(f"{'Username':<15} | {'Role':<10}")
    print("-" * 30)

    for user in users:
        username, role = user
        print(f"{username:<15} | {role:<10}")

    print("="*50)

    cursor.execute('SELECT username, role FROM users WHERE username = ?', ('1',))
    user_1 = cursor.fetchone()

    if user_1:
        print(f"\nUser '1' found with role: '{user_1[1]}'")

        if user_1[1] != 'reviewer':
            print(f"⚠️  Current role '{user_1[1]}' does not match expected 'reviewer'")
            print("This mismatch is causing the 403 permission error!")
            print(f"\nTo fix, run: UPDATE users SET role = 'reviewer' WHERE username = '1'")
        else:
            print("✓ Role is correctly set to 'reviewer'")
    else:
        print("\n❌ User '1' not found in database!")

    conn.close()
else:
    print("❌ Database file not found!")
