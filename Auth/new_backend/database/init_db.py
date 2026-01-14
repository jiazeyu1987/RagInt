import sqlite3
import hashlib
import time
import uuid
import os


def hash_password(password: str) -> str:
    """Hash password using SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()


def init_database(db_path: str = None):
    """
    Initialize SQLite database with new schema (no user_sessions or auth_audit tables).

    Args:
        db_path: Path to database file. If None, uses default path.
    """
    if db_path is None:
        script_dir = os.path.dirname(__file__)
        db_path = os.path.join(script_dir, "..", "data", "auth.db")

    # Ensure data directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create users table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")

    # Create kb_documents table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_status ON kb_documents(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_kb ON kb_documents(kb_id)")

    # Note: user_sessions and auth_audit tables are removed for AuthX

    # Create default admin user if not exists
    cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
    if cursor.fetchone()[0] == 0:
        admin_user_id = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)

        cursor.execute("""
            INSERT INTO users (
                user_id, username, password_hash, email, role, status,
                created_at_ms, last_login_at_ms, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            admin_user_id,
            "admin",
            hash_password("admin123"),
            "admin@example.com",
            "admin",
            "active",
            now_ms,
            None,
            "system"
        ))

        print(f"[OK] Created default admin user (username: admin, password: admin123)")

    conn.commit()
    conn.close()

    print(f"[OK] Database initialized at: {db_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Initialize Auth database")
    parser.add_argument("--db-path", help="Path to database file")
    args = parser.parse_args()

    print("\n" + "=" * 50)
    print("Initializing Auth Backend Database...")
    print("=" * 50 + "\n")

    init_database(args.db_path)

    print("\n" + "=" * 50)
    print("Database initialization complete!")
    print("=" * 50 + "\n")
