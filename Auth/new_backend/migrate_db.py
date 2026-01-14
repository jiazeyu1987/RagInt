import sqlite3
import shutil
import os
import argparse


def migrate_database(old_db_path: str, new_db_path: str = None):
    """
    Migrate data from old database (with user_sessions, auth_audit) to new database (without).

    Args:
        old_db_path: Path to old database file
        new_db_path: Path to new database file. If None, overwrites old file.
    """
    # Backup old database
    backup_path = f"{old_db_path}.backup"
    print(f"✓ Backing up old database to: {backup_path}")
    shutil.copy2(old_db_path, backup_path)

    # Determine new database path
    if new_db_path is None:
        new_db_path = old_db_path

    # Connect to old database
    old_conn = sqlite3.connect(old_db_path)
    old_conn.row_factory = sqlite3.Row
    old_cursor = old_conn.cursor()

    # Connect to new database
    new_conn = sqlite3.connect(new_db_path)
    new_cursor = new_conn.cursor()

    # Create new schema
    print("✓ Creating new schema...")

    # Create users table
    new_cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL DEFAULT 'viewer',
            status TEXT NOT NULL DEFAULT 'active',
            created_at_ms INTEGER NOT NULL,
            last_login_at_ms INTEGER,
            created_by TEXT
        )
    """)
    new_cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    new_cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")

    # Create kb_documents table
    new_cursor.execute("""
        CREATE TABLE IF NOT EXISTS kb_documents (
            doc_id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT NOT NULL,
            uploaded_by TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            uploaded_at_ms INTEGER NOT NULL,
            reviewed_by TEXT,
            reviewed_at_ms INTEGER,
            review_notes TEXT,
            ragflow_doc_id TEXT,
            kb_id TEXT NOT NULL DEFAULT '展厅',
            FOREIGN KEY (uploaded_by) REFERENCES users(user_id),
            FOREIGN KEY (reviewed_by) REFERENCES users(user_id)
        )
    """)
    new_cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_status ON kb_documents(status)")
    new_cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_kb ON kb_documents(kb_id)")

    # Migrate users
    print("✓ Migrating users...")
    old_cursor.execute("SELECT * FROM users")
    users = old_cursor.fetchall()

    for user in users:
        new_cursor.execute("""
            INSERT OR REPLACE INTO users (
                user_id, username, password_hash, email, role, status,
                created_at_ms, last_login_at_ms, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user["user_id"],
            user["username"],
            user["password_hash"],
            user["email"],
            user["role"],
            user["status"],
            user["created_at_ms"],
            user["last_login_at_ms"],
            user["created_by"],
        ))

    print(f"  ✓ Migrated {len(users)} users")

    # Migrate kb_documents
    print("✓ Migrating kb_documents...")
    old_cursor.execute("SELECT * FROM kb_documents")
    documents = old_cursor.fetchall()

    for doc in documents:
        new_cursor.execute("""
            INSERT OR REPLACE INTO kb_documents (
                doc_id, filename, file_path, file_size, mime_type,
                uploaded_by, status, uploaded_at_ms, reviewed_by,
                reviewed_at_ms, review_notes, ragflow_doc_id, kb_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            doc["doc_id"],
            doc["filename"],
            doc["file_path"],
            doc["file_size"],
            doc["mime_type"],
            doc["uploaded_by"],
            doc["status"],
            doc["uploaded_at_ms"],
            doc["reviewed_by"],
            doc["reviewed_at_ms"],
            doc["review_notes"],
            doc["ragflow_doc_id"],
            doc["kb_id"],
        ))

    print(f"  ✓ Migrated {len(documents)} documents")

    # Note: user_sessions and auth_audit are NOT migrated (no longer needed)

    # Commit and close
    new_conn.commit()
    old_conn.close()
    new_conn.close()

    print(f"\n✓ Migration complete! New database at: {new_db_path}")
    print(f"✓ Backup saved at: {backup_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Migrate database from old schema to new schema"
    )
    parser.add_argument(
        "--old-db",
        required=True,
        help="Path to old database file (with user_sessions, auth_audit)",
    )
    parser.add_argument(
        "--new-db",
        help="Path to new database file (default: overwrite old file)",
    )
    args = parser.parse_args()

    print("\n" + "=" * 50)
    print("Database Migration")
    print("=" * 50 + "\n")

    if not os.path.exists(args.old_db):
        print(f"✗ Error: Old database not found at: {args.old_db}")
        exit(1)

    migrate_database(args.old_db, args.new_db)

    print("\n" + "=" * 50)
    print("Migration complete!")
    print("=" * 50 + "\n")
