from typing import List

from pydantic import BaseModel


class BatchGrantRequest(BaseModel):
    user_ids: List[str]
    kb_ids: List[str]


class KbListResponse(BaseModel):
    kb_ids: List[str]

