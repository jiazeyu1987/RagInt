from __future__ import annotations

import os
from pathlib import Path


def _env_invalid(key: str, raw: object, expected: str) -> ValueError:
    return ValueError(f"env_invalid key={key} expected={expected} value={raw!r}")


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
    except (TypeError, ValueError) as exc:
        raise _env_invalid(key, raw, "int") from exc


def env_float(key: str, default: float) -> float:
    raw = os.environ.get(key)
    if raw is None:
        return float(default)
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError) as exc:
        raise _env_invalid(key, raw, "float") from exc


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
    raise _env_invalid(key, raw, "bool")
