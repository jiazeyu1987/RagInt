"""
增强型权限组数据存储服务
支持资源配置（知识库、聊天体）和细粒度操作权限
"""
import sqlite3
import logging
import json
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime


class PermissionGroupStore:
    def __init__(self, database_path: str, logger: logging.Logger = None):
        self._database_path = database_path
        self._logger = logger or logging.getLogger(__name__)

    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接"""
        conn = sqlite3.connect(self._database_path)
        conn.row_factory = sqlite3.Row
        return conn

    def create_group(
        self,
        group_name: str,
        description: str = None,
        accessible_kbs: List[str] = None,
        accessible_chats: List[str] = None,
        can_upload: bool = False,
        can_review: bool = False,
        can_download: bool = True,
        can_delete: bool = False
    ) -> Optional[int]:
        """
        创建权限组

        Args:
            group_name: 权限组名称（唯一）
            description: 描述
            accessible_kbs: 可访问的知识库ID列表
            accessible_chats: 可访问的聊天体ID列表
            can_upload: 上传权限
            can_review: 审核权限
            can_download: 下载权限
            can_delete: 删除权限

        Returns:
            创建的权限组ID，失败返回None
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 检查权限组名是否已存在
                cursor.execute(
                    "SELECT group_id FROM permission_groups WHERE group_name = ?",
                    (group_name,)
                )
                if cursor.fetchone():
                    self._logger.warning(f"权限组已存在: {group_name}")
                    return None

                # 创建权限组
                cursor.execute(
                    """
                    INSERT INTO permission_groups (
                        group_name, description, is_system,
                        accessible_kbs, accessible_chats,
                        can_upload, can_review, can_download, can_delete
                    ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        group_name,
                        description,
                        json.dumps(accessible_kbs or []),
                        json.dumps(accessible_chats or []),
                        1 if can_upload else 0,
                        1 if can_review else 0,
                        1 if can_download else 0,
                        1 if can_delete else 0
                    )
                )
                group_id = cursor.lastrowid

                conn.commit()
                self._logger.info(f"创建权限组成功: {group_name} (ID: {group_id})")
                return group_id

        except Exception as e:
            self._logger.error(f"创建权限组失败: {e}")
            return None

    def get_group(self, group_id: int) -> Optional[Dict]:
        """
        获取权限组信息

        Args:
            group_id: 权限组ID

        Returns:
            权限组信息字典
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 获取权限组基本信息
                cursor.execute(
                    """
                    SELECT group_id, group_name, description, is_system,
                           accessible_kbs, accessible_chats,
                           can_upload, can_review, can_download, can_delete,
                           created_at, updated_at
                    FROM permission_groups
                    WHERE group_id = ?
                    """,
                    (group_id,)
                )
                row = cursor.fetchone()

                if not row:
                    return None

                group = dict(row)

                # 解析JSON字段
                group['accessible_kbs'] = json.loads(group['accessible_kbs'] or '[]')
                group['accessible_chats'] = json.loads(group['accessible_chats'] or '[]')

                # 转换布尔值
                group['can_upload'] = bool(group['can_upload'])
                group['can_review'] = bool(group['can_review'])
                group['can_download'] = bool(group['can_download'])
                group['can_delete'] = bool(group['can_delete'])

                # 获取用户数量
                cursor.execute(
                    "SELECT COUNT(*) as count FROM users WHERE group_id = ?",
                    (group_id,)
                )
                group['user_count'] = cursor.fetchone()['count']

                return group

        except Exception as e:
            self._logger.error(f"获取权限组失败: {e}")
            return None

    def get_group_by_name(self, group_name: str) -> Optional[Dict]:
        """
        根据名称获取权限组

        Args:
            group_name: 权限组名称

        Returns:
            权限组信息字典
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    """
                    SELECT group_id, group_name, description, is_system,
                           accessible_kbs, accessible_chats,
                           can_upload, can_review, can_download, can_delete,
                           created_at, updated_at
                    FROM permission_groups
                    WHERE group_name = ?
                    """,
                    (group_name,)
                )
                row = cursor.fetchone()

                if not row:
                    return None

                group = dict(row)
                group['accessible_kbs'] = json.loads(group['accessible_kbs'] or '[]')
                group['accessible_chats'] = json.loads(group['accessible_chats'] or '[]')
                group['can_upload'] = bool(group['can_upload'])
                group['can_review'] = bool(group['can_review'])
                group['can_download'] = bool(group['can_download'])
                group['can_delete'] = bool(group['can_delete'])

                cursor.execute(
                    "SELECT COUNT(*) as count FROM users WHERE group_id = ?",
                    (group['group_id'],)
                )
                group['user_count'] = cursor.fetchone()['count']

                return group

        except Exception as e:
            self._logger.error(f"获取权限组失败: {e}")
            return None

    def list_groups(self) -> List[Dict]:
        """
        列出所有权限组

        Returns:
            权限组列表
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    """
                    SELECT group_id, group_name, description, is_system,
                           accessible_kbs, accessible_chats,
                           can_upload, can_review, can_download, can_delete,
                           created_at, updated_at
                    FROM permission_groups
                    ORDER BY group_id
                    """
                )
                groups = []

                for row in cursor.fetchall():
                    group = dict(row)
                    group['accessible_kbs'] = json.loads(group['accessible_kbs'] or '[]')
                    group['accessible_chats'] = json.loads(group['accessible_chats'] or '[]')
                    group['can_upload'] = bool(group['can_upload'])
                    group['can_review'] = bool(group['can_review'])
                    group['can_download'] = bool(group['can_download'])
                    group['can_delete'] = bool(group['can_delete'])

                    # 获取用户数量
                    cursor.execute(
                        "SELECT COUNT(*) as count FROM users WHERE group_id = ?",
                        (group['group_id'],)
                    )
                    group['user_count'] = cursor.fetchone()['count']

                    groups.append(group)

                return groups

        except Exception as e:
            self._logger.error(f"列出权限组失败: {e}")
            return []

    def update_group(
        self,
        group_id: int,
        group_name: str = None,
        description: str = None,
        accessible_kbs: List[str] = None,
        accessible_chats: List[str] = None,
        can_upload: bool = None,
        can_review: bool = None,
        can_download: bool = None,
        can_delete: bool = None
    ) -> bool:
        """
        更新权限组

        Args:
            group_id: 权限组ID
            group_name: 新名称
            description: 新描述
            accessible_kbs: 可访问的知识库列表
            accessible_chats: 可访问的聊天体列表
            can_upload: 上传权限
            can_review: 审核权限
            can_download: 下载权限
            can_delete: 删除权限

        Returns:
            是否成功
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 检查是否为系统权限组
                cursor.execute("SELECT is_system FROM permission_groups WHERE group_id = ?", (group_id,))
                row = cursor.fetchone()
                if not row:
                    self._logger.warning(f"权限组不存在: {group_id}")
                    return False

                if row['is_system']:
                    self._logger.warning(f"不能修改系统权限组: {group_id}")
                    return False

                # 更新基本信息
                update_fields = []
                params = []

                if group_name:
                    cursor.execute(
                        "SELECT group_id FROM permission_groups WHERE group_name = ? AND group_id != ?",
                        (group_name, group_id)
                    )
                    if cursor.fetchone():
                        self._logger.warning(f"权限组名称已存在: {group_name}")
                        return False
                    update_fields.append("group_name = ?")
                    params.append(group_name)

                if description is not None:
                    update_fields.append("description = ?")
                    params.append(description)

                if accessible_kbs is not None:
                    update_fields.append("accessible_kbs = ?")
                    params.append(json.dumps(accessible_kbs))

                if accessible_chats is not None:
                    update_fields.append("accessible_chats = ?")
                    params.append(json.dumps(accessible_chats))

                if can_upload is not None:
                    update_fields.append("can_upload = ?")
                    params.append(1 if can_upload else 0)

                if can_review is not None:
                    update_fields.append("can_review = ?")
                    params.append(1 if can_review else 0)

                if can_download is not None:
                    update_fields.append("can_download = ?")
                    params.append(1 if can_download else 0)

                if can_delete is not None:
                    update_fields.append("can_delete = ?")
                    params.append(1 if can_delete else 0)

                update_fields.append("updated_at = ?")
                params.append(datetime.now().isoformat())
                params.append(group_id)

                if update_fields:
                    cursor.execute(
                        f"UPDATE permission_groups SET {', '.join(update_fields)} WHERE group_id = ?",
                        params
                    )

                conn.commit()
                self._logger.info(f"更新权限组成功: {group_id}")
                return True

        except Exception as e:
            self._logger.error(f"更新权限组失败: {e}")
            return False

    def delete_group(self, group_id: int) -> bool:
        """
        删除权限组

        Args:
            group_id: 权限组ID

        Returns:
            是否成功
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 检查是否为系统权限组
                cursor.execute("SELECT is_system FROM permission_groups WHERE group_id = ?", (group_id,))
                row = cursor.fetchone()
                if not row:
                    self._logger.warning(f"权限组不存在: {group_id}")
                    return False

                if row['is_system']:
                    self._logger.warning(f"不能删除系统权限组: {group_id}")
                    return False

                # 检查是否有用户使用此权限组
                cursor.execute("SELECT COUNT(*) as count FROM users WHERE group_id = ?", (group_id,))
                user_count = cursor.fetchone()['count']
                if user_count > 0:
                    self._logger.warning(f"权限组仍有 {user_count} 个用户使用，无法删除")
                    return False

                # 删除权限组
                cursor.execute("DELETE FROM permission_groups WHERE group_id = ?", (group_id,))

                conn.commit()
                self._logger.info(f"删除权限组成功: {group_id}")
                return True

        except Exception as e:
            self._logger.error(f"删除权限组失败: {e}")
            return False

    def get_user_permissions(self, user_id: int) -> Dict:
        """
        获取用户的权限（通过权限组）

        Args:
            user_id: 用户ID

        Returns:
            权限字典
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()

                # 获取用户的权限组
                cursor.execute(
                    """
                    SELECT pg.accessible_kbs, pg.accessible_chats,
                           pg.can_upload, pg.can_review, pg.can_download, pg.can_delete
                    FROM permission_groups pg
                    INNER JOIN users u ON u.group_id = pg.group_id
                    WHERE u.user_id = ?
                    """,
                    (user_id,)
                )
                row = cursor.fetchone()

                if not row:
                    return {
                        'accessible_kbs': [],
                        'accessible_chats': [],
                        'can_upload': False,
                        'can_review': False,
                        'can_download': False,
                        'can_delete': False
                    }

                return {
                    'accessible_kbs': json.loads(row['accessible_kbs'] or '[]'),
                    'accessible_chats': json.loads(row['accessible_chats'] or '[]'),
                    'can_upload': bool(row['can_upload']),
                    'can_review': bool(row['can_review']),
                    'can_download': bool(row['can_download']),
                    'can_delete': bool(row['can_delete'])
                }

        except Exception as e:
            self._logger.error(f"获取用户权限失败: {e}")
            return {
                'accessible_kbs': [],
                'accessible_chats': [],
                'can_upload': False,
                'can_review': False,
                'can_download': False,
                'can_delete': False
            }
