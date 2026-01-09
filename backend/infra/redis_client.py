from __future__ import annotations

import os
from typing import Any


def create_redis_client(*, url_env: str = "RAGINT_REDIS_URL"):
    """
    Lazy Redis client factory.
    - Uses `redis` (redis-py). Import is deferred so Redis remains optional unless enabled.
    - URL comes from env (default: RAGINT_REDIS_URL).
    """
    url = str(os.environ.get(url_env) or "").strip()
    if not url:
        raise RuntimeError(f"redis_url_missing env={url_env}")

    try:
        import redis  # type: ignore
    except Exception as e:
        raise RuntimeError(f"redis_client_unavailable err={e}") from e

    client: Any = redis.Redis.from_url(url, decode_responses=True)
    return client

