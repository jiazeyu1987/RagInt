from pydantic import BaseModel
from typing import Optional, List


class UserCreate(BaseModel):
    """User creation model"""
    username: str
    password: str
    email: Optional[str] = None
    group_id: Optional[int] = None  # 向后兼容
    group_ids: Optional[List[int]] = None  # 新字段：支持多个权限组
    status: str = "active"


class UserUpdate(BaseModel):
    """User update model"""
    email: Optional[str] = None
    group_id: Optional[int] = None  # 向后兼容
    group_ids: Optional[List[int]] = None  # 新字段：支持多个权限组
    status: Optional[str] = None


class UserResponse(BaseModel):
    """User response model"""
    user_id: str
    username: str
    email: Optional[str] = None
    group_id: Optional[int] = None  # 权限组ID（已废弃，保留用于向后兼容）
    group_ids: List[int] = []  # 新字段：权限组ID列表
    group_name: Optional[str] = None  # 权限组名称（已废弃）
    permission_groups: List[dict] = []  # 新字段：权限组详情
    role: str  # 保留role字段用于向后兼容
    status: str
    created_at_ms: int
    last_login_at_ms: Optional[int] = None
