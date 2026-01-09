from __future__ import annotations

import os


def get_version() -> str:
    """
    Runtime version string for packaging/delivery.

    Prefer environment injection (CI/build system):
    - RAGINT_VERSION
    """
    v = str(os.environ.get("RAGINT_VERSION") or "").strip()
    return v or "0.0.0"

