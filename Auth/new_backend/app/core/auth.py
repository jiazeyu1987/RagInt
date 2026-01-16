from __future__ import annotations

from typing import Annotated

from authx import TokenPayload
from fastapi import Depends, HTTPException, Request

from core.security import auth
from dependencies import AppDependencies


def get_deps(request: Request) -> AppDependencies:
    return request.app.state.deps


def get_current_payload(request: Request) -> TokenPayload:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header.split(" ")[1]
    payload = auth._decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


AuthRequired = Annotated[TokenPayload, Depends(get_current_payload)]

