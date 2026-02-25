from __future__ import annotations


def json_body_dict(req, *, silent: bool = True) -> dict:
    data = req.get_json(silent=silent)
    return data if isinstance(data, dict) else {}


def parse_int_or_default(value, *, default: int, min_value: int | None = None, max_value: int | None = None) -> int:
    try:
        out = int(value)
    except Exception:
        out = int(default)
    if min_value is not None and out < min_value:
        out = int(min_value)
    if max_value is not None and out > max_value:
        out = int(max_value)
    return out
