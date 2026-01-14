import sqlite3
from pathlib import Path

def update_user_role():
    db_path = Path(__file__).parent / "data" / "auth.db"

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 更新用户1的角色
    cursor.execute('UPDATE users SET role = ? WHERE username = ?', ('reviewer', '1'))
    conn.commit()

    # 验证更新
    cursor.execute('SELECT username, role FROM users WHERE username = ?', ('1',))
    user = cursor.fetchone()

    if user:
        print(f"✓ 用户 '{user[0]}' 的角色已更新为: '{user[1]}'")
    else:
        print("❌ 用户 '1' 不存在")

    conn.close()

if __name__ == "__main__":
    update_user_role()
