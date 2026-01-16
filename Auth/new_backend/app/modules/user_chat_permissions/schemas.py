from typing import List

from pydantic import BaseModel


class BatchGrantChatsRequest(BaseModel):
    user_ids: List[str]
    chat_ids: List[str]


class ChatListResponse(BaseModel):
    chat_ids: List[str]

