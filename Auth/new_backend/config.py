import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Auth Backend - FastAPI"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    # AuthX JWT
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRES: int = 60 * 15  # 15 minutes
    JWT_REFRESH_TOKEN_EXPIRES: int = 60 * 60 * 24 * 7  # 7 days

    # Database
    DATABASE_PATH: str = "data/auth.db"

    # File Upload
    UPLOAD_DIR: str = "data/uploads"
    MAX_FILE_SIZE: int = 16 * 1024 * 1024  # 16MB
    ALLOWED_EXTENSIONS: set = {".txt", ".pdf", ".doc", ".docx", ".md", ".ppt", ".pptx"}

    # CORS
    CORS_ORIGINS: list[str] = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
