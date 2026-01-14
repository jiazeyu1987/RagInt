import sqlite3
from pathlib import Path

def fix_user_role():
    db_path = Path(__file__).parent / "data" / "auth.db"

    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        # Check current state
        cursor.execute('SELECT username, role FROM users WHERE username = ?', ('1',))
        user = cursor.fetchone()

        if not user:
            print("❌ User '1' not found in database")
            return

        username, current_role = user
        print(f"Found user '{username}' with current role: '{current_role}'")

        if current_role == 'reviewer':
            print("✓ Role is already 'reviewer' - no change needed")
            return

        # Update the role
        print(f"Updating role from '{current_role}' to 'reviewer'...")
        cursor.execute('UPDATE users SET role = ? WHERE username = ?', ('reviewer', '1'))
        conn.commit()

        # Verify the change
        cursor.execute('SELECT username, role FROM users WHERE username = ?', ('1',))
        updated_user = cursor.fetchone()
        new_role = updated_user[1]

        print(f"✓ Role successfully updated to: '{new_role}'")
        print("\nUser '1' should now be able to access document APIs")

    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    fix_user_role()
