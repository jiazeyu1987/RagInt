import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "data" / "auth.db"
output_path = Path(__file__).parent / "role_diagnosis.txt"

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(f"Database path: {db_path}\n")
    f.write(f"Database exists: {db_path.exists()}\n\n")

    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        cursor.execute('SELECT username, role FROM users')
        users = cursor.fetchall()

        f.write("="*50 + "\n")
        f.write("Current users in database:\n")
        f.write("="*50 + "\n")
        f.write(f"{'Username':<15} | {'Role':<15}\n")
        f.write("-" * 35 + "\n")

        for user in users:
            username, role = user
            f.write(f"{username:<15} | {role:<15}\n")

        f.write("="*50 + "\n\n")

        cursor.execute('SELECT username, role FROM users WHERE username = ?', ('1',))
        user_1 = cursor.fetchone()

        if user_1:
            f.write(f"User '1' found with role: '{user_1[1]}'\n")

            if user_1[1] != 'reviewer':
                f.write(f"⚠️  Current role '{user_1[1]}' does not match expected 'reviewer'\n")
                f.write("This is causing the 403 permission error!\n")
            else:
                f.write("✓ Role is correctly set to 'reviewer'\n")
        else:
            f.write("❌ User '1' not found in database!\n")

        conn.close()

print("Diagnosis complete. Check role_diagnosis.txt for results.")
