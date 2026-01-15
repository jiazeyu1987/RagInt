import sqlite3
import hashlib
import time
import uuid
from dataclasses import dataclass
from typing import Optional, List, Set
from pathlib import Path


@dataclass
class User:
    user_id: str
    username: str
    password_hash: str
    email: Optional[str] = None
    role: str = "viewer"
    group_id: Optional[int] = None  # 权限组ID（已废弃，保留用于向后兼容）
    group_ids: List[int] = None  # 新字段：权限组ID列表
    status: str = "active"
    created_at_ms: int = 0
    last_login_at_ms: Optional[int] = None
    created_by: Optional[str] = None

    def __post_init__(self):
        if self.group_ids is None:
            self.group_ids = []


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
                # 手动构造 User，避免字段顺序错位
                user = User(
                    user_id=row[0],
                    username=row[1],
                    password_hash=row[2],
                    email=row[3],
                    role=row[4],
                    group_id=row[5],
                    status=row[6],
                    created_at_ms=row[7],
                    last_login_at_ms=row[8],
                    created_by=row[9],
                )
                # 加载权限组列表
                user.group_ids = self._get_user_group_ids(user.user_id, conn)
                return user
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
                # 手动构造 User，避免字段顺序错位
                user = User(
                    user_id=row[0],
                    username=row[1],
                    password_hash=row[2],
                    email=row[3],
                    role=row[4],
                    group_id=row[5],
                    status=row[6],
                    created_at_ms=row[7],
                    last_login_at_ms=row[8],
                    created_by=row[9],
                )
                # 加载权限组列表
                user.group_ids = self._get_user_group_ids(user.user_id, conn)
                return user
            return None
        finally:
            conn.close()

    def _get_user_group_ids(self, user_id: str, conn) -> List[int]:
        """获取用户的所有权限组ID"""
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT group_id FROM user_permission_groups WHERE user_id = ?
            """, (user_id,))
            return [row[0] for row in cursor.fetchall()]
        except sqlite3.OperationalError as e:
            if "no such table: user_permission_groups" in str(e):
                # Table doesn't exist yet (migration not run), return empty list
                return []
            raise

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
            # 手动构造 User，避免字段顺序错位
            users = []
            for row in rows:
                user = User(
                    user_id=row[0],
                    username=row[1],
                    password_hash=row[2],
                    email=row[3],
                    role=row[4],
                    group_id=row[5],
                    status=row[6],
                    created_at_ms=row[7],
                    last_login_at_ms=row[8],
                    created_by=row[9],
                )
                # 加载权限组列表
                user.group_ids = self._get_user_group_ids(user.user_id, conn)
                users.append(user)
            return users
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

    def set_user_permission_groups(self, user_id: str, group_ids: List[int]) -> bool:
        """
        设置用户的权限组列表（替换现有列表）

        Args:
            user_id: 用户ID
            group_ids: 权限组ID列表

        Returns:
            是否成功
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            now_ms = int(time.time() * 1000)

            # 创建表（如果不存在）
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_permission_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    group_id INTEGER NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                    FOREIGN KEY (group_id) REFERENCES permission_groups(group_id) ON DELETE CASCADE,
                    UNIQUE(user_id, group_id)
                )
            """)

            # 创建索引（如果不存在）
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_upg_user_id
                ON user_permission_groups(user_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_upg_group_id
                ON user_permission_groups(group_id)
            """)

            # 删除现有的用户-权限组关系
            cursor.execute("DELETE FROM user_permission_groups WHERE user_id = ?", (user_id,))

            # 插入新的关系
            for group_id in group_ids:
                cursor.execute("""
                    INSERT INTO user_permission_groups (user_id, group_id, created_at_ms)
                    VALUES (?, ?, ?)
                """, (user_id, group_id, now_ms))

            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            print(f"Error setting user permission groups: {e}")
            return False
        finally:
            conn.close()

    def add_user_to_permission_group(self, user_id: str, group_id: int) -> bool:
        """
        添加用户到权限组（不删除现有关系）

        Args:
            user_id: 用户ID
            group_id: 权限组ID

        Returns:
            是否成功
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            # 创建表（如果不存在）
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_permission_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    group_id INTEGER NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                    FOREIGN KEY (group_id) REFERENCES permission_groups(group_id) ON DELETE CASCADE,
                    UNIQUE(user_id, group_id)
                )
            """)

            now_ms = int(time.time() * 1000)
            cursor.execute("""
                INSERT OR IGNORE INTO user_permission_groups (user_id, group_id, created_at_ms)
                VALUES (?, ?, ?)
            """, (user_id, group_id, now_ms))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            print(f"Error adding user to permission group: {e}")
            return False
        finally:
            conn.close()

    def remove_user_from_permission_group(self, user_id: str, group_id: int) -> bool:
        """
        从权限组移除用户

        Args:
            user_id: 用户ID
            group_id: 权限组ID

        Returns:
            是否成功
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                DELETE FROM user_permission_groups
                WHERE user_id = ? AND group_id = ?
            """, (user_id, group_id))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            print(f"Error removing user from permission group: {e}")
            return False
        finally:
            conn.close()

