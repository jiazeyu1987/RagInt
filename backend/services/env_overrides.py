from __future__ import annotations

import os
from typing import Any


def _set_nested(d: dict, path: list[str], value: Any) -> None:
    cur: Any = d
    for key in path[:-1]:
        if not isinstance(cur, dict):
            return
        nxt = cur.get(key)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[key] = nxt
        cur = nxt
    if isinstance(cur, dict):
        cur[path[-1]] = value


def apply_env_overrides(cfg: dict) -> dict:
    """
    Merge a small set of environment variables into config.
    - Secrets should be provided via env in delivery; config file keeps placeholders.
    - We record only "source" metadata (no secret values) under cfg["__meta"].
    """
    base = cfg if isinstance(cfg, dict) else {}
    out = dict(base)
    meta = out.get("__meta")
    if not isinstance(meta, dict):
        meta = {}
        out["__meta"] = meta
    overrides = meta.get("env_overrides")
    if not isinstance(overrides, list):
        overrides = []
        meta["env_overrides"] = overrides

    def put(env_key: str, path: list[str], *, cast=str) -> None:
        raw = os.environ.get(env_key)
        if raw is None:
            return
        raw = str(raw)
        if not raw.strip():
            return
        val: Any = raw
        try:
            val = cast(raw)
        except Exception:
            val = raw
        _set_nested(out, path, val)
        overrides.append({"env": env_key, "path": ".".join(path)})

    # RAGFlow runtime credentials (read-only) and base config.
    put("RAGFLOW_API_KEY", ["api_key"])
    put("RAGFLOW_API_KEY_READONLY", ["api_key"])
    put("RAGFLOW_BASE_URL", ["base_url"])
    put("RAGFLOW_DATASET_NAME", ["dataset_name"])
    put("RAGFLOW_DEFAULT_CONVERSATION_NAME", ["default_conversation_name"])

    # ASR/TTS provider keys.
    put("DASHSCOPE_API_KEY", ["asr", "dashscope", "api_key"])
    put("BAILIAN_API_KEY", ["tts", "bailian", "api_key"])

    # Navigation provider selection.
    put("NAV_PROVIDER", ["nav", "provider"])
    put("NAV_TIMEOUT_S", ["nav", "timeout_s"], cast=float)
    put("NAV_HTTP_BASE_URL", ["nav", "http", "base_url"])
    put("NAV_HTTP_GO_TO_PATH", ["nav", "http", "go_to_path"])
    put("NAV_HTTP_CANCEL_PATH", ["nav", "http", "cancel_path"])
    put("NAV_HTTP_STATE_PATH", ["nav", "http", "state_path"])
    put("NAV_HTTP_POLL_INTERVAL_MS", ["nav", "http", "poll_interval_ms"], cast=int)
    put("NAV_MOCK_ARRIVE_DELAY_MS", ["nav", "mock", "arrive_delay_ms"], cast=int)

    # Record admin-key presence without loading it into runtime config.
    admin_present = bool(str(os.environ.get("RAGFLOW_ADMIN_API_KEY") or "").strip())
    meta["ragflow_admin_api_key_present"] = admin_present

    return out

