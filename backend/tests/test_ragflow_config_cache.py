from __future__ import annotations

from flask import Flask

from backend.api.ragflow_config_cache import get_ragflow_app_config, get_ragflow_bundle, get_ragflow_config
from backend.config import RagflowAppConfig


class _Svc:
    def __init__(self):
        self.calls = 0

    def load_config(self, *, force: bool = False) -> dict:  # noqa: ARG002
        self.calls += 1
        return {"tour": {"stops": ["a", "b"]}, "nav": {"provider": "mock"}}


class _Deps:
    def __init__(self):
        self.ragflow_service = _Svc()


def test_get_ragflow_config_cached_within_request():
    app = Flask(__name__)
    deps = _Deps()
    with app.test_request_context("/x"):
        a = get_ragflow_config(deps=deps)
        b = get_ragflow_config(deps=deps)
        assert a is b
        assert deps.ragflow_service.calls == 1


def test_get_ragflow_config_force_uses_separate_cache_key():
    app = Flask(__name__)
    deps = _Deps()
    with app.test_request_context("/x"):
        _ = get_ragflow_config(deps=deps)
        _ = get_ragflow_config(deps=deps, force=True)
        _ = get_ragflow_config(deps=deps, force=True)
        assert deps.ragflow_service.calls == 2


def test_get_ragflow_app_config_cached_and_typed():
    app = Flask(__name__)
    deps = _Deps()
    with app.test_request_context("/x"):
        a = get_ragflow_app_config(deps=deps)
        b = get_ragflow_app_config(deps=deps)
        assert isinstance(a, RagflowAppConfig)
        assert a is b
        assert a.tour.stops == ["a", "b"]
        assert deps.ragflow_service.calls == 1


def test_get_ragflow_bundle_returns_both_and_reuses_cache():
    app = Flask(__name__)
    deps = _Deps()
    with app.test_request_context("/x"):
        raw, typed = get_ragflow_bundle(deps=deps)
        assert isinstance(raw, dict)
        assert isinstance(typed, RagflowAppConfig)
        assert typed.tour.stops == ["a", "b"]
        assert deps.ragflow_service.calls == 1
