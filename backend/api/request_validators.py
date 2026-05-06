from __future__ import annotations

from werkzeug.exceptions import BadRequest, UnsupportedMediaType


def json_body_dict(req, *, silent: bool = True) -> dict:
    if not getattr(req, "content_length", None) and not getattr(req, "is_json", False):
        return {}

    try:
        data = req.get_json(silent=False)
    except (BadRequest, UnsupportedMediaType) as exc:
        if not silent:
            raise
        raise ValueError("invalid_json") from exc

    if data is None:
        return {}
    if not isinstance(data, dict):
        if not silent:
            raise BadRequest("json_body_must_be_object")
        raise ValueError("json_body_must_be_object")
    return data


def parse_int_or_default(value, *, default: int, min_value: int | None = None, max_value: int | None = None) -> int:
    if value is None or str(value).strip() == "":
        return int(default)
    try:
        out = int(value)
    except Exception:
        raise ValueError("invalid_integer")
    if min_value is not None and out < min_value:
        raise ValueError("integer_below_min")
    if max_value is not None and out > max_value:
        raise ValueError("integer_above_max")
    return out
