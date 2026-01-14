import sqlite3
import time
from dataclasses import dataclass
from typing import Optional, List
from pathlib import Path


@dataclass
class UserKbPermission:
    id: int
    user_id: str
    kb_id: str
    granted_by: str
    granted_at_ms: int


class UserKbPermissionStore:
    def __init__(self, db_path: str = None):
        if db_path is None:
            script_dir = Path(__file__).parent.parent
            db_path = script_dir / "data" / "auth.db"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self):
        return sqlite3.connect(str(self.db_path))

    def grant_permission(self, user_id: str, kb_id: str, granted_by: str) -> UserKbPermission:
        """
        授予用户知识库权限
        如果权限已存在，则更新 granted_by 和 granted_at_ms
        """
        now_ms = int(time.time() * 1000)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            # 使用 INSERT OR REPLACE 处理重复
            cursor.execute("""
                INSERT INTO user_kb_permissions (user_id, kb_id, granted_by, granted_at_ms)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, kb_id) DO UPDATE SET
                    granted_by = excluded.granted_by,
                    granted_at_ms = excluded.granted_at_ms
            """, (user_id, kb_id, granted_by, now_ms))

            conn.commit()

            # 获取插入/更新的记录
            cursor.execute("""
                SELECT id, user_id, kb_id, granted_by, granted_at_ms
                FROM user_kb_permissions
                WHERE user_id = ? AND kb_id = ?
            """, (user_id, kb_id))
            row = cursor.fetchone()
            return UserKbPermission(*row)
        finally:
            conn.close()

    def revoke_permission(self, user_id: str, kb_id: str) -> bool:
        """
        撤销用户的知识库权限
        返回是否成功撤销（如果权限不存在返回False）
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_kb_permissions
                WHERE user_id = ? AND kb_id = ?
            """, (user_id, kb_id))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def get_user_kbs(self, user_id: str) -> List[str]:
        """
        获取用户可访问的知识库ID列表
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT kb_id FROM user_kb_permissions
                WHERE user_id = ?
                ORDER BY kb_id
            """, (user_id,))
            rows = cursor.fetchall()
            return [row[0] for row in rows]
        finally:
            conn.close()

    def get_kb_users(self, kb_id: str) -> List[str]:
        """
        获取可访问某知识库的用户ID列表
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT user_id FROM user_kb_permissions
                WHERE kb_id = ?
                ORDER BY user_id
            """, (kb_id,))
            rows = cursor.fetchall()
            return [row[0] for row in rows]
        finally:
            conn.close()

    def check_permission(self, user_id: str, kb_id: str) -> bool:
        """
        检查用户是否有某知识库的权限
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT COUNT(*) FROM user_kb_permissions
                WHERE user_id = ? AND kb_id = ?
            """, (user_id, kb_id))
            return cursor.fetchone()[0] > 0
        finally:
            conn.close()

    def grant_batch_permissions(self, user_ids: List[str], kb_ids: List[str], granted_by: str) -> int:
        """
        批量授予多个用户多个知识库的权限
        返回授予的权限数量
        """
        now_ms = int(time.time() * 1000)
        count = 0

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            for user_id in user_ids:
                for kb_id in kb_ids:
                    cursor.execute("""
                        INSERT INTO user_kb_permissions (user_id, kb_id, granted_by, granted_at_ms)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(user_id, kb_id) DO UPDATE SET
                            granted_by = excluded.granted_by,
                            granted_at_ms = excluded.granted_at_ms
                    """, (user_id, kb_id, granted_by, now_ms))
                    count += 1
            conn.commit()
            return count
        finally:
            conn.close()

    def revoke_all_user_permissions(self, user_id: str) -> int:
        """
        撤销用户的所有知识库权限
        返回撤销的权限数量
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_kb_permissions
                WHERE user_id = ?
            """, (user_id,))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    def revoke_all_kb_permissions(self, kb_id: str) -> int:
        """
        撤销某知识库的所有用户权限
        返回撤销的权限数量
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_kb_permissions
                WHERE kb_id = ?
            """, (kb_id,))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()
