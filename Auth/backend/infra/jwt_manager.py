import jwt
from datetime import datetime, timedelta
from typing import Dict, Optional


JWT_SECRET = "auth-service-secret-key-change-in-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24


class JwtManager:
    def __init__(self, secret: str = JWT_SECRET, algorithm: str = JWT_ALGORITHM):
        self.secret = secret
        self.algorithm = algorithm

    def create_token(
        self,
        user_id: str,
        username: str,
        role: str,
        expires_in_hours: int = JWT_EXPIRATION_HOURS
    ) -> str:
        payload = {
            "user_id": user_id,
            "username": username,
            "role": role,
            "exp": datetime.utcnow() + timedelta(hours=expires_in_hours),
            "iat": datetime.utcnow()
        }
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    def decode_token(self, token: str) -> Optional[Dict]:
        try:
            payload = jwt.decode(token, self.secret, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    def verify_token(self, token: str) -> tuple[bool, Optional[Dict], Optional[str]]:
        try:
            payload = jwt.decode(token, self.secret, algorithms=[self.algorithm])
            return True, payload, None
        except jwt.ExpiredSignatureError:
            return False, None, "token_expired"
        except jwt.InvalidTokenError:
            return False, None, "invalid_token"

    def get_user_id_from_token(self, token: str) -> Optional[str]:
        payload = self.decode_token(token)
        if payload:
            return payload.get("user_id")
        return None

    def get_role_from_token(self, token: str) -> Optional[str]:
        payload = self.decode_token(token)
        if payload:
            return payload.get("role")
        return None
