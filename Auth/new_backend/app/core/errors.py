from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_id import get_request_id

logger = logging.getLogger(__name__)


def _rid_from_request(request: Request) -> str | None:
    return getattr(getattr(request, "state", None), "request_id", None) or get_request_id()


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = _rid_from_request(request)
        logger.warning("Validation error: %s rid=%s", exc.errors(), request_id)
        return JSONResponse(
            status_code=422,
            content={
                "code": "VALIDATION_ERROR",
                "message": "Validation error",
                "detail": exc.errors(),
                "body": exc.body,
                "request_id": request_id,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        request_id = _rid_from_request(request)
        content: dict[str, Any] = {
            "code": f"HTTP_{exc.status_code}",
            "message": str(exc.detail),
            "detail": exc.detail,
            "request_id": request_id,
        }
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = _rid_from_request(request)
        logger.exception("Unhandled error rid=%s", request_id)
        return JSONResponse(
            status_code=500,
            content={
                "code": "INTERNAL_ERROR",
                "message": "Internal server error",
                "detail": str(exc),
                "request_id": request_id,
            },
        )
