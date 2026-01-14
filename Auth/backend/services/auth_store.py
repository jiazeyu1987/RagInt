import sqlite3
import hashlib
import time
import uuid
from dataclasses import dataclass
from typing import Optional
from pathlib import Path


@dataclass
class UserSession:
    session_id: str
    user_id: str
    token_hash: str
    created_at_ms: int
    expires_at_ms: int
    revoked_at_ms: Optional[int] = None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AuthStore:
    def __init__(self, db_path: str = None):
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "auth.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self):
        return sqlite3.connect(str(self.db_path))

    def create_session(
        self,
        user_id: str,
        token: str,
        expires_in_ms: int = 86400000
    ) -> UserSession:
        session_id = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)
        expires_at_ms = now_ms + expires_in_ms
        token_hash = hash_token(token)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO user_sessions (session_id, user_id, token_hash, created_at_ms, expires_at_ms)
                VALUES (?, ?, ?, ?, ?)
            """, (session_id, user_id, token_hash, now_ms, expires_at_ms))
            conn.commit()
            return UserSession(
                session_id=session_id,
                user_id=user_id,
                token_hash=token_hash,
                created_at_ms=now_ms,
                expires_at_ms=expires_at_ms
            )
        finally:
            conn.close()

    def revoke_session(self, token_hash: str) -> bool:
        now_ms = int(time.time() * 1000)
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                UPDATE user_sessions
                SET revoked_at_ms = ?
                WHERE token_hash = ? AND revoked_at_ms IS NULL
            """, (now_ms, token_hash))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def revoke_all_user_sessions(self, user_id: str) -> int:
        now_ms = int(time.time() * 1000)
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                UPDATE user_sessions
                SET revoked_at_ms = ?
                WHERE user_id = ? AND revoked_at_ms IS NULL
            """, (now_ms, user_id))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    def is_session_revoked(self, token_hash: str) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT revoked_at_ms FROM user_sessions
                WHERE token_hash = ?
            """, (token_hash,))
            row = cursor.fetchone()
            if not row:
                return False
            return row[0] is not None
        finally:
            conn.close()

    def is_session_valid(self, token_hash: str) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT expires_at_ms, revoked_at_ms FROM user_sessions
                WHERE token_hash = ?
            """, (token_hash,))
            row = cursor.fetchone()
            if not row:
                return False

            expires_at_ms, revoked_at_ms = row
            now_ms = int(time.time() * 1000)

            if revoked_at_ms is not None:
                return False
            if now_ms > expires_at_ms:
                return False
            return True
        finally:
            conn.close()

    def get_session_by_token(self, token_hash: str) -> Optional[UserSession]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT session_id, user_id, token_hash, created_at_ms, expires_at_ms, revoked_at_ms
                FROM user_sessions
                WHERE token_hash = ?
            """, (token_hash,))
            row = cursor.fetchone()
            if row:
                return UserSession(*row)
            return None
        finally:
            conn.close()

    def cleanup_expired_sessions(self, older_than_ms: int = None) -> int:
        if older_than_ms is None:
            older_than_ms = int(time.time() * 1000) - (7 * 24 * 3600 * 1000)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_sessions
                WHERE expires_at_ms < ?
            """, (older_than_ms,))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    def get_active_sessions(self, user_id: str) -> list[UserSession]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            now_ms = int(time.time() * 1000)
            cursor.execute("""
                SELECT session_id, user_id, token_hash, created_at_ms, expires_at_ms, revoked_at_ms
                FROM user_sessions
                WHERE user_id = ? AND expires_at_ms > ? AND revoked_at_ms IS NULL
                ORDER BY created_at_ms DESC
            """, (user_id, now_ms))
            rows = cursor.fetchall()
            return [UserSession(*row) for row in rows]
        finally:
            conn.close()
