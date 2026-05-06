from __future__ import annotations

from flask import g, has_request_context

from backend.config import RagflowAppConfig


def _load_ragflow_config_dict(*, deps, force: bool = False) -> dict:
    cfg = deps.ragflow_service.load_config(force=bool(force))
    if cfg is None:
        raise TypeError("ragflow config missing")
    if not isinstance(cfg, dict):
        raise TypeError("ragflow config must be a dict")
    return cfg


def _request_cache_get(*, key: str, loader):
    if not has_request_context():
        return loader()
    cached = getattr(g, key, None)
    if cached is not None:
        return cached
    value = loader()
    setattr(g, key, value)
    return value


def get_ragflow_config(*, deps, force: bool = False) -> dict:
    """
    Request-scoped cache for RagflowService.load_config().

    RagflowService already has an mtime-based cache, but this removes per-call:
    - file stat
    - lock acquisition
    when the same request touches config multiple times.
    """
    key = "_ragflow_config_force" if force else "_ragflow_config"
    return _request_cache_get(key=key, loader=lambda: _load_ragflow_config_dict(deps=deps, force=force))


def get_ragflow_app_config(*, deps) -> RagflowAppConfig:
    return _request_cache_get(key="_ragflow_app_cfg", loader=lambda: RagflowAppConfig.from_any(get_ragflow_config(deps=deps)))


def get_ragflow_bundle(*, deps) -> tuple[dict, RagflowAppConfig]:
    raw = get_ragflow_config(deps=deps)
    typed = get_ragflow_app_config(deps=deps)
    return raw, typed
