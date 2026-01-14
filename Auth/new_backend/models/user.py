from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    """User creation model"""
    username: str
    password: str
    email: Optional[str] = None
    role: str = "viewer"
    status: str = "active"


class UserUpdate(BaseModel):
    """User update model"""
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


class UserResponse(BaseModel):
    """User response model"""
    user_id: str
    username: str
    email: Optional[str] = None
    role: str
    status: str
    created_at_ms: int
    last_login_at_ms: Optional[int] = None
