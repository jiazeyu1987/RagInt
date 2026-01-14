from pydantic import BaseModel


class LoginRequest(BaseModel):
    """Login request model"""
    username: str
    password: str


class TokenResponse(BaseModel):
    """Token response model"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    scopes: list[str] = []
