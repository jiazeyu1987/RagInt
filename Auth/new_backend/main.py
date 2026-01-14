from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from config import settings
from core.security import auth as authx_auth

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    from dependencies import create_dependencies

    app.state.deps = create_dependencies()
    print(f"[OK] Dependencies initialized")
    yield
    # Shutdown
    print("[OK] Shutting down...")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="Knowledge base authentication and authorization service",
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register AuthX error handlers
    authx_auth.handle_errors(app)

    # Add validation error handler to see 422 errors
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.error("=" * 80)
        logger.error("VALIDATION ERROR (422)")
        logger.error("=" * 80)
        logger.error(f"URL: {request.url}")
        logger.error(f"Method: {request.method}")
        logger.error(f"Query params: {dict(request.query_params)}")
        logger.error(f"Headers: {dict(request.headers)}")
        logger.error(f"Validation errors: {exc.errors()}")
        logger.error(f"Body: {exc.body}")
        logger.error("=" * 80)
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors(), "body": exc.body},
        )

    # Import and register all routers
    from api import auth, users, knowledge, review, ragflow

    app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
    app.include_router(users.router, prefix="/api/users", tags=["Users"])
    app.include_router(knowledge.router, prefix="/api/knowledge", tags=["Knowledge Base"])
    app.include_router(review.router, prefix="/api/knowledge", tags=["Document Review"])
    app.include_router(ragflow.router, prefix="/api/ragflow", tags=["RAGFlow Integration"])

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "service": "auth-backend-fastapi"}

    @app.get("/")
    async def root():
        return {
            "service": "Auth Backend (FastAPI)",
            "version": "2.0.0",
            "auth": "AuthX JWT + Scopes",
        }

    return app


# For uvicorn entry point
app = create_app()
