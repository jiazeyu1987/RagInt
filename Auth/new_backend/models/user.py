from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    """User creation model"""
    username: str
    password: str
    email: Optional[str] = None
    group_id: Optional[int] = None  # 使用权限组ID而非角色
    status: str = "active"


class UserUpdate(BaseModel):
    """User update model"""
    email: Optional[str] = None
    group_id: Optional[int] = None  # 使用权限组ID而非角色
    status: Optional[str] = None


class UserResponse(BaseModel):
    """User response model"""
    user_id: str
    username: str
    email: Optional[str] = None
    group_id: Optional[int] = None  # 权限组ID
    group_name: Optional[str] = None  # 权限组名称
    role: str  # 保留role字段用于向后兼容
    status: str
    created_at_ms: int
    last_login_at_ms: Optional[int] = None
