import sqlite3
import hashlib
import time
import uuid
from dataclasses import dataclass
from typing import Optional, List
from pathlib import Path


@dataclass
class User:
    user_id: str
    username: str
    password_hash: str
    email: Optional[str] = None
    role: str = "viewer"
    group_id: Optional[int] = None  # 权限组ID
    status: str = "active"
    created_at_ms: int = 0
    last_login_at_ms: Optional[int] = None
    created_by: Optional[str] = None


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


class UserStore:
    def __init__(self, db_path: str = None):
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "auth.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self):
        return sqlite3.connect(str(self.db_path))

    def get_by_username(self, username: str) -> Optional[User]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT user_id, username, password_hash, email, role, group_id, status,
                       created_at_ms, last_login_at_ms, created_by
                FROM users WHERE username = ?
            """, (username,))
            row = cursor.fetchone()
            if row:
                return User(*row)
            return None
        finally:
            conn.close()

    def get_by_user_id(self, user_id: str) -> Optional[User]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT user_id, username, password_hash, email, role, group_id, status,
                       created_at_ms, last_login_at_ms, created_by
                FROM users WHERE user_id = ?
            """, (user_id,))
            row = cursor.fetchone()
            if row:
                return User(*row)
            return None
        finally:
            conn.close()

    def create_user(
        self,
        username: str,
        password: str,
        email: Optional[str] = None,
        role: str = "viewer",
        group_id: Optional[int] = None,
        status: str = "active",
        created_by: Optional[str] = None
    ) -> User:
        user_id = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)
        password_hash = hash_password(password)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO users (
                    user_id, username, password_hash, email, role, group_id, status,
                    created_at_ms, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, username, password_hash, email, role, group_id, status, now_ms, created_by))
            conn.commit()
            return User(
                user_id=user_id,
                username=username,
                password_hash=password_hash,
                email=email,
                role=role,
                group_id=group_id,
                status=status,
                created_at_ms=now_ms,
                created_by=created_by
            )
        except sqlite3.IntegrityError:
            raise ValueError(f"Username '{username}' already exists")
        finally:
            conn.close()

    def update_user(
        self,
        user_id: str,
        email: Optional[str] = None,
        role: Optional[str] = None,
        group_id: Optional[int] = None,
        status: Optional[str] = None
    ) -> Optional[User]:
        updates = []
        params = []

        if email is not None:
            updates.append("email = ?")
            params.append(email)
        if role is not None:
            updates.append("role = ?")
            params.append(role)
        if group_id is not None:
            updates.append("group_id = ?")
            params.append(group_id)
        if status is not None:
            updates.append("status = ?")
            params.append(status)

        if not updates:
            return self.get_by_user_id(user_id)

        params.append(user_id)
        query = f"UPDATE users SET {', '.join(updates)} WHERE user_id = ?"

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(query, params)
            conn.commit()
            return self.get_by_user_id(user_id)
        finally:
            conn.close()

    def update_last_login(self, user_id: str):
        now_ms = int(time.time() * 1000)
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE users SET last_login_at_ms = ? WHERE user_id = ?", (now_ms, user_id))
            conn.commit()
        finally:
            conn.close()

    def update_password(self, user_id: str, new_password: str):
        password_hash = hash_password(new_password)
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE users SET password_hash = ? WHERE user_id = ?", (password_hash, user_id))
            conn.commit()
        finally:
            conn.close()

    def list_users(self, role: Optional[str] = None, status: Optional[str] = None, limit: int = 100) -> List[User]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            query = """
                SELECT user_id, username, password_hash, email, role, group_id, status,
                       created_at_ms, last_login_at_ms, created_by
                FROM users
                WHERE 1=1
            """
            params = []

            if role:
                query += " AND role = ?"
                params.append(role)
            if status:
                query += " AND status = ?"
                params.append(status)

            query += " ORDER BY created_at_ms DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [User(*row) for row in rows]
        finally:
            conn.close()

    def delete_user(self, user_id: str) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def count_users(self, role: Optional[str] = None, status: Optional[str] = None) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            query = "SELECT COUNT(*) FROM users WHERE 1=1"
            params = []

            if role:
                query += " AND role = ?"
                params.append(role)
            if status:
                query += " AND status = ?"
                params.append(status)

            cursor.execute(query, params)
            return cursor.fetchone()[0]
        finally:
            conn.close()
