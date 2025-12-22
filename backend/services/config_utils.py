from __future__ import annotations


def get_nested(config: dict, path: list, default=None):
    cur = config
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur

