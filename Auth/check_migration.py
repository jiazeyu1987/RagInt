import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "new_backend" / "data" / "auth.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# Check if table exists
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_permission_groups'")
table_exists = cursor.fetchone()
print(f"Table 'user_permission_groups' exists: {table_exists is not None}")

# Check record count
if table_exists:
    cursor.execute("SELECT COUNT(*) FROM user_permission_groups")
    count = cursor.fetchone()[0]
    print(f"Number of records in user_permission_groups: {count}")

    # Show some sample data
    cursor.execute("""
        SELECT upg.user_id, u.username, upg.group_id, pg.group_name
        FROM user_permission_groups upg
        LEFT JOIN users u ON upg.user_id = u.user_id
        LEFT JOIN permission_groups pg ON upg.group_id = pg.group_id
        LIMIT 5
    """)
    print("\nSample user-permission group relationships:")
    for row in cursor.fetchall():
        print(f"  {row[0]} | {row[1]} | group_id={row[2]} | {row[3]}")

conn.close()
