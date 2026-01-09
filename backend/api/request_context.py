from __future__ import annotations

import uuid
from typing import Any

from flask import Request
import contextlib


def get_request_id(
    req: Request,
    *,
    data: dict | None = None,
    form: Any | None = None,
    prefix: str = "req",
) -> str:
    """
    Best-effort request_id resolution (shared across endpoints).
    Order:
    - payload field `request_id`
    - header `X-Request-ID`
    - auto-generated `${prefix}_${uuid}`
    """
    rid = ""
    with contextlib.suppress(Exception):
        if isinstance(data, dict):
            rid = str(data.get("request_id") or "").strip()
    if not rid:
        with contextlib.suppress(Exception):
            if form is not None:
                rid = str(form.get("request_id") or "").strip()
    if not rid:
        with contextlib.suppress(Exception):
            rid = str(req.headers.get("X-Request-ID") or "").strip()
    if not rid:
        rid = f"{str(prefix or 'req').strip() or 'req'}_{uuid.uuid4().hex[:12]}"
    return rid


def get_client_id(req: Request, *, data: dict | None = None, form: Any | None = None, default: str = "-") -> str:
    """
    Best-effort client_id resolution (shared across endpoints).
    Order:
    - payload field `client_id`
    - header `X-Client-ID`
    - req.remote_addr
    """
    cid = ""
    with contextlib.suppress(Exception):
        if isinstance(data, dict):
            cid = str(data.get("client_id") or "").strip()
    if not cid:
        with contextlib.suppress(Exception):
            if form is not None:
                cid = str(form.get("client_id") or "").strip()
    if not cid:
        with contextlib.suppress(Exception):
            cid = str(req.headers.get("X-Client-ID") or "").strip()
    if not cid:
        with contextlib.suppress(Exception):
            cid = str(req.remote_addr or "").strip()
    return cid or str(default or "-")
