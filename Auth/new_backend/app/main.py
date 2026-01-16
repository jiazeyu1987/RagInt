from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.request_id import RequestIdMiddleware
from core.security import auth as authx_auth

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.dependencies import create_dependencies

    app.state.deps = create_dependencies()
    print("[OK] Dependencies initialized")
    yield
    print("[OK] Shutting down...")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="Knowledge base authentication and authorization service",
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )

    app.add_middleware(RequestIdMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    authx_auth.handle_errors(app)

    from api import (
        agents,
        auth,
        chat,
        knowledge,
        permission_groups,
        ragflow,
        review,
        user_chat_permissions,
        user_kb_permissions,
        users,
    )

    app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
    app.include_router(users.router, prefix="/api/users", tags=["Users"])
    app.include_router(knowledge.router, prefix="/api/knowledge", tags=["Knowledge Base"])
    app.include_router(review.router, prefix="/api/knowledge", tags=["Document Review"])
    app.include_router(ragflow.router, prefix="/api/ragflow", tags=["RAGFlow Integration"])
    app.include_router(user_kb_permissions.router, prefix="/api", tags=["User KB Permissions"])
    app.include_router(user_chat_permissions.router, prefix="/api", tags=["User Chat Permissions"])
    app.include_router(chat.router, prefix="/api", tags=["Chat"])
    app.include_router(agents.router, prefix="/api", tags=["Agents"])
    app.include_router(permission_groups.create_router(), prefix="/api", tags=["Permission Groups"])

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "service": "auth-backend-fastapi"}

    @app.get("/")
    async def root():
        return {
            "service": "Auth Backend (FastAPI)",
            "version": settings.APP_VERSION,
            "auth": "AuthX JWT + Scopes",
        }

    return app


app = create_app()
