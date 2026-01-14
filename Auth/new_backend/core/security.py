from authx import AuthX, AuthXConfig
from config import settings

# AuthX Configuration
auth_config = AuthXConfig(
    # JWT Settings
    JWT_ALGORITHM=settings.JWT_ALGORITHM,
    JWT_SECRET_KEY=settings.JWT_SECRET_KEY,
    # Token Location (headers, cookies, query)
    JWT_TOKEN_LOCATION=["headers", "cookies", "query"],
    JWT_HEADER_TYPE="Bearer",
    JWT_QUERY_STRING_NAME="token",
    # Cookie Settings
    JWT_ACCESS_COOKIE_NAME="access_token",
    JWT_REFRESH_COOKIE_NAME="refresh_token",
    JWT_COOKIE_CSRF_PROTECT=False,
    # Token Expiration
    JWT_ACCESS_TOKEN_EXPIRES=settings.JWT_ACCESS_TOKEN_EXPIRES,
    JWT_REFRESH_TOKEN_EXPIRES=settings.JWT_REFRESH_TOKEN_EXPIRES,
)

# Initialize AuthX
auth = AuthX(config=auth_config)
