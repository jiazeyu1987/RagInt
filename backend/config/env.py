from __future__ import annotations

import os
from pathlib import Path


def env_str(key: str, default: str = "") -> str:
    return str(os.environ.get(key) or default).strip()


def env_path(key: str, default: Path) -> Path:
    return Path(os.environ.get(key) or default).resolve()


def env_int(key: str, default: int) -> int:
    raw = os.environ.get(key)
    if raw is None:
        return int(default)
    try:
        return int(str(raw).strip())
    except Exception:
        return int(default)


def env_float(key: str, default: float) -> float:
    raw = os.environ.get(key)
    if raw is None:
        return float(default)
    try:
        return float(str(raw).strip())
    except Exception:
        return float(default)


def env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return bool(default)
    if isinstance(raw, bool):
        return bool(raw)
    s = str(raw).strip().lower()
    if s in ("1", "true", "yes", "y", "on"):
        return True
    if s in ("0", "false", "no", "n", "off"):
        return False
    return bool(default)

