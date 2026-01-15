import sqlite3
import time
from typing import List, Optional, Dict
from pathlib import Path


class ChatSessionStore:
    """Manages chat session data in SQLite database."""

    def __init__(self, db_path: str = None):
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "auth.db"

        self.db_path = Path(db_path)
        self._ensure_db_exists()

    def _ensure_db_exists(self):
        """Ensure database file exists."""
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found: {self.db_path}")

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def create_session(
        self,
        session_id: str,
        chat_id: str,
        user_id: str,
        name: str
    ) -> bool:
        """
        Create a new chat session record.

        Args:
            session_id: Session ID from RAGFlow
            chat_id: Chat assistant ID
            user_id: User ID who created the session
            name: Session name

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            now_ms = int(time.time() * 1000)

            cursor.execute("""
                INSERT INTO chat_sessions (session_id, chat_id, user_id, name, created_at_ms, is_deleted)
                VALUES (?, ?, ?, ?, ?, 0)
            """, (session_id, chat_id, user_id, name, now_ms))

            conn.commit()
            conn.close()
            return True

        except sqlite3.IntegrityError:
            # Session already exists, update it
            return self.update_session(session_id, chat_id, name)
        except Exception as e:
            print(f"[ERROR] Failed to create session: {e}")
            return False

    def update_session(
        self,
        session_id: str,
        chat_id: str,
        name: Optional[str] = None
    ) -> bool:
        """
        Update an existing session.

        Args:
            session_id: Session ID
            chat_id: Chat assistant ID
            name: New session name (optional)

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if name:
                cursor.execute("""
                    UPDATE chat_sessions
                    SET name = ?
                    WHERE session_id = ? AND chat_id = ? AND is_deleted = 0
                """, (name, session_id, chat_id))

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            print(f"[ERROR] Failed to update session: {e}")
            return False

    def get_user_sessions(
        self,
        chat_id: str,
        user_id: str
    ) -> List[Dict]:
        """
        Get all non-deleted sessions for a user in a specific chat.

        Args:
            chat_id: Chat assistant ID
            user_id: User ID

        Returns:
            List of session dictionaries
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT session_id, chat_id, user_id, name, created_at_ms
                FROM chat_sessions
                WHERE chat_id = ? AND user_id = ? AND is_deleted = 0
                ORDER BY created_at_ms DESC
            """, (chat_id, user_id))

            rows = cursor.fetchall()
            conn.close()

            sessions = []
            for row in rows:
                sessions.append({
                    "id": row["session_id"],
                    "chat_id": row["chat_id"],
                    "user_id": row["user_id"],
                    "name": row["name"],
                    "create_time": row["created_at_ms"],
                    "messages": []
                })

            return sessions

        except Exception as e:
            print(f"[ERROR] Failed to get user sessions: {e}")
            return []

    def get_session(
        self,
        session_id: str,
        chat_id: str
    ) -> Optional[Dict]:
        """
        Get a specific session.

        Args:
            session_id: Session ID
            chat_id: Chat assistant ID

        Returns:
            Session dictionary or None if not found
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT session_id, chat_id, user_id, name, created_at_ms
                FROM chat_sessions
                WHERE session_id = ? AND chat_id = ? AND is_deleted = 0
            """, (session_id, chat_id))

            row = cursor.fetchone()
            conn.close()

            if row:
                return {
                    "id": row["session_id"],
                    "chat_id": row["chat_id"],
                    "user_id": row["user_id"],
                    "name": row["name"],
                    "create_time": row["created_at_ms"],
                    "messages": []
                }

            return None

        except Exception as e:
            print(f"[ERROR] Failed to get session: {e}")
            return None

    def delete_sessions(
        self,
        session_ids: List[str],
        chat_id: str,
        deleted_by: str
    ) -> bool:
        """
        Soft delete sessions (mark as deleted).

        Args:
            session_ids: List of session IDs to delete
            chat_id: Chat assistant ID
            deleted_by: User ID who is deleting

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            now_ms = int(time.time() * 1000)

            for session_id in session_ids:
                cursor.execute("""
                    UPDATE chat_sessions
                    SET is_deleted = 1, deleted_at_ms = ?, deleted_by = ?
                    WHERE session_id = ? AND chat_id = ? AND is_deleted = 0
                """, (now_ms, deleted_by, session_id, chat_id))

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            print(f"[ERROR] Failed to delete sessions: {e}")
            return False

    def check_ownership(
        self,
        session_id: str,
        chat_id: str,
        user_id: str
    ) -> bool:
        """
        Check if a user owns a specific session.

        Args:
            session_id: Session ID
            chat_id: Chat assistant ID
            user_id: User ID to check

        Returns:
            True if user owns the session, False otherwise
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            cursor.execute("""
                SELECT COUNT(*) as count
                FROM chat_sessions
                WHERE session_id = ? AND chat_id = ? AND user_id = ? AND is_deleted = 0
            """, (session_id, chat_id, user_id))

            row = cursor.fetchone()
            conn.close()

            return row["count"] > 0

        except Exception as e:
            print(f"[ERROR] Failed to check session ownership: {e}")
            return False
