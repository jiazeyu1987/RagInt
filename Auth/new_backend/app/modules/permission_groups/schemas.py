from typing import List, Optional

from pydantic import BaseModel


class PermissionGroupCreate(BaseModel):
    group_name: str
    description: Optional[str] = ""
    accessible_kbs: Optional[List[str]] = []
    accessible_chats: Optional[List[str]] = []
    can_upload: bool = False
    can_review: bool = False
    can_download: bool = True
    can_delete: bool = False


class PermissionGroupUpdate(BaseModel):
    group_name: Optional[str] = None
    description: Optional[str] = None
    accessible_kbs: Optional[List[str]] = None
    accessible_chats: Optional[List[str]] = None
    can_upload: Optional[bool] = None
    can_review: Optional[bool] = None
    can_download: Optional[bool] = None
    can_delete: Optional[bool] = None

