import sqlite3
import time
from dataclasses import dataclass
from typing import Optional, List
from pathlib import Path


@dataclass
class UserChatPermission:
    id: int
    user_id: str
    chat_id: str
    granted_by: str
    granted_at_ms: int


class UserChatPermissionStore:
    def __init__(self, db_path: str = None):
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "auth.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self):
        return sqlite3.connect(str(self.db_path))

    def grant_permission(self, user_id: str, chat_id: str, granted_by: str) -> UserChatPermission:
        """
        授予用户聊天助手权限
        如果权限已存在，则更新 granted_by 和 granted_at_ms
        """
        now_ms = int(time.time() * 1000)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            # 使用 INSERT OR REPLACE 处理重复
            cursor.execute("""
                INSERT INTO user_chat_permissions (user_id, chat_id, granted_by, granted_at_ms)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, chat_id) DO UPDATE SET
                    granted_by = excluded.granted_by,
                    granted_at_ms = excluded.granted_at_ms
            """, (user_id, chat_id, granted_by, now_ms))

            conn.commit()

            # 获取插入/更新的记录
            cursor.execute("""
                SELECT id, user_id, chat_id, granted_by, granted_at_ms
                FROM user_chat_permissions
                WHERE user_id = ? AND chat_id = ?
            """, (user_id, chat_id))
            row = cursor.fetchone()
            return UserChatPermission(*row)
        finally:
            conn.close()

    def revoke_permission(self, user_id: str, chat_id: str) -> bool:
        """
        撤销用户的聊天助手权限
        返回是否成功撤销（如果权限不存在返回False）
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_chat_permissions
                WHERE user_id = ? AND chat_id = ?
            """, (user_id, chat_id))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def get_user_chats(self, user_id: str) -> List[str]:
        """
        获取用户可访问的聊天助手ID列表
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT chat_id FROM user_chat_permissions
                WHERE user_id = ?
                ORDER BY chat_id
            """, (user_id,))
            rows = cursor.fetchall()
            return [row[0] for row in rows]
        finally:
            conn.close()

    def get_chat_users(self, chat_id: str) -> List[str]:
        """
        获取可访问某聊天助手的用户ID列表
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT user_id FROM user_chat_permissions
                WHERE chat_id = ?
                ORDER BY user_id
            """, (chat_id,))
            rows = cursor.fetchall()
            return [row[0] for row in rows]
        finally:
            conn.close()

    def check_permission(self, user_id: str, chat_id: str) -> bool:
        """
        检查用户是否有某聊天助手的权限
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT COUNT(*) FROM user_chat_permissions
                WHERE user_id = ? AND chat_id = ?
            """, (user_id, chat_id))
            return cursor.fetchone()[0] > 0
        finally:
            conn.close()

    def grant_batch_permissions(self, user_ids: List[str], chat_ids: List[str], granted_by: str) -> int:
        """
        批量授予多个用户多个聊天助手的权限
        返回授予的权限数量
        """
        now_ms = int(time.time() * 1000)
        count = 0

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            for user_id in user_ids:
                for chat_id in chat_ids:
                    cursor.execute("""
                        INSERT INTO user_chat_permissions (user_id, chat_id, granted_by, granted_at_ms)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(user_id, chat_id) DO UPDATE SET
                            granted_by = excluded.granted_by,
                            granted_at_ms = excluded.granted_at_ms
                    """, (user_id, chat_id, granted_by, now_ms))
                    count += 1
            conn.commit()
            return count
        finally:
            conn.close()

    def revoke_all_user_permissions(self, user_id: str) -> int:
        """
        撤销用户的所有聊天助手权限
        返回撤销的权限数量
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_chat_permissions
                WHERE user_id = ?
            """, (user_id,))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    def revoke_all_chat_permissions(self, chat_id: str) -> int:
        """
        撤销某聊天助手的所有用户权限
        返回撤销的权限数量
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_chat_permissions
                WHERE chat_id = ?
            """, (chat_id,))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()
