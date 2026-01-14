import os
import sqlite3
import hashlib
import time
import uuid
from pathlib import Path


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def init_database(db_path: str = None):
    if db_path is None:
        script_dir = Path(__file__).parent.parent
        db_path = script_dir / "data" / "auth.db"

    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL,
            expires_at_ms INTEGER NOT NULL,
            revoked_at_ms INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    """)

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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auth_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts_ms INTEGER NOT NULL,
            actor_kind TEXT NOT NULL,
            actor_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}'
        )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_audit_ts ON auth_audit(ts_ms DESC)")

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

        print(f"Created default admin user: username=admin, password=admin123")

    conn.commit()
    conn.close()

    print(f"Database initialized at: {db_path}")
    print(f"Tables created: users, user_sessions, kb_documents, auth_audit")


if __name__ == "__main__":
    import sys

    db_path = sys.argv[1] if len(sys.argv) > 1 else None
    init_database(db_path)
