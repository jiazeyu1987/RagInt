from __future__ import annotations

from flask import jsonify


def ok_json(**payload):
    body = {"ok": True}
    body.update(payload or {})
    return jsonify(body)


def error_json(*, error: str, status: int, ok: bool = False, **payload):
    body = {"ok": ok, "error": str(error or "error")}
    body.update(payload or {})
    return jsonify(body), int(status)


def bad_request_json(*, error: str, **payload):
    return error_json(error=error, status=400, **payload)


def unauthorized_json(*, error: str = "unauthorized", **payload):
    return error_json(error=error, status=401, **payload)
