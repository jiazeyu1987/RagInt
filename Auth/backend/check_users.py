import sqlite3
import sys
from pathlib import Path

db_path = Path(__file__).parent / "data" / "auth.db"

print(f"Database path: {db_path}")
print(f"Database exists: {db_path.exists()}")

if db_path.exists():
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 查询所有用户
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

    # 检查用户 "1" 的角色
    cursor.execute('SELECT username, role FROM users WHERE username = ?', ('1',))
    user_1 = cursor.fetchone()

    if user_1:
        print(f"\nUser '1' found with role: '{user_1[1]}'")

        # 如果角色不对，询问是否修复
        if user_1[1] != 'reviewer':
            print(f"\n⚠️  Current role '{user_1[1]}' is incorrect!")
            print(f"   Should be 'reviewer' for document access")

            response = input("\nDo you want to fix the role? (yes/no): ")
            if response.lower() in ['yes', 'y']:
                cursor.execute('UPDATE users SET role = ? WHERE username = ?', ('reviewer', '1'))
                conn.commit()
                print("✓ Role updated to 'reviewer'")
            else:
                print("✗ Role not updated")
        else:
            print("✓ Role is already 'reviewer'")
    else:
        print("\n❌ User '1' not found in database!")
        print("Please check the username")

    conn.close()
else:
    print("❌ Database file not found!")

print("\nDone!")
