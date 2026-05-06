from __future__ import annotations

from pathlib import Path

import pytest
import requests

from backend.adapters.nav_provider import HttpNavProvider, build_nav_provider
from backend.infra.cancellation import CancellationRegistry
from backend.infra.event_store import EventStore
from backend.services.config_service import ConfigService
from backend.services.nav_service import NavService


def test_build_nav_provider_rejects_mock_runtime_provider():
    with pytest.raises(ValueError, match="nav_provider_mock_not_allowed"):
        build_nav_provider({"nav": {"provider": "mock"}})


def test_build_nav_provider_requires_http_base_url():
    with pytest.raises(ValueError, match="nav_http_base_url_missing"):
        build_nav_provider({"nav": {"provider": "http", "http": {"base_url": ""}}})


def test_http_nav_provider_raises_when_go_to_request_fails(monkeypatch):
    def fail_post(*args, **kwargs):
        raise requests.ConnectionError("gateway unavailable")

    monkeypatch.setattr("backend.adapters.nav_provider.requests.post", fail_post)

    with pytest.raises(RuntimeError, match="nav_http_go_to_failed:ConnectionError"):
        HttpNavProvider().run_move(
            config={"nav": {"provider": "http", "http": {"base_url": "http://nav-gateway"}}},
            client_id="client-1",
            request_id="nav-1",
            stop_id="lobby",
            stop_name="Lobby",
            cancel_ev=CancellationRegistry().register(client_id="client-1", request_id="nav-1", kind="nav"),
            timeout_s=5,
        )


def test_http_nav_provider_raises_when_state_request_fails(monkeypatch):
    class OkResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

    def ok_post(*args, **kwargs):
        return OkResponse()

    def fail_get(*args, **kwargs):
        raise requests.Timeout("state timeout")

    monkeypatch.setattr("backend.adapters.nav_provider.requests.post", ok_post)
    monkeypatch.setattr("backend.adapters.nav_provider.requests.get", fail_get)

    with pytest.raises(RuntimeError, match="nav_http_state_failed:Timeout"):
        HttpNavProvider().run_move(
            config={"nav": {"provider": "http", "http": {"base_url": "http://nav-gateway", "poll_interval_ms": 100}}},
            client_id="client-1",
            request_id="nav-2",
            stop_id="lobby",
            stop_name="Lobby",
            cancel_ev=CancellationRegistry().register(client_id="client-1", request_id="nav-2", kind="nav"),
            timeout_s=5,
        )


def test_http_nav_provider_raises_when_state_payload_is_corrupt(monkeypatch):
    class OkPostResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

    class BadStateResponse(OkPostResponse):
        def json(self):
            return ["not", "an", "object"]

    monkeypatch.setattr("backend.adapters.nav_provider.requests.post", lambda *args, **kwargs: OkPostResponse())
    monkeypatch.setattr("backend.adapters.nav_provider.requests.get", lambda *args, **kwargs: BadStateResponse())

    with pytest.raises(ValueError, match="nav_http_state_payload_invalid"):
        HttpNavProvider().run_move(
            config={"nav": {"provider": "http", "http": {"base_url": "http://nav-gateway", "poll_interval_ms": 100}}},
            client_id="client-1",
            request_id="nav-3",
            stop_id="lobby",
            stop_name="Lobby",
            cancel_ev=CancellationRegistry().register(client_id="client-1", request_id="nav-3", kind="nav"),
            timeout_s=5,
        )


def test_nav_service_go_to_rejects_mock_before_starting_move():
    service = NavService(request_registry=CancellationRegistry(), event_store=EventStore())

    with pytest.raises(ValueError, match="nav_provider_mock_not_allowed"):
        service.go_to(
            config={"nav": {"provider": "mock"}},
            client_id="client-1",
            request_id="nav-1",
            stop_id="lobby",
        )

    assert service.get_state(client_id="client-1")["state"] == "idle"


def test_nav_service_go_to_requires_real_http_provider_config():
    service = NavService(request_registry=CancellationRegistry(), event_store=EventStore())

    with pytest.raises(ValueError, match="nav_http_base_url_missing"):
        service.go_to(
            config={"nav": {"provider": "http", "http": {"base_url": ""}}},
            client_id="client-1",
            request_id="nav-2",
            stop_id="lobby",
        )

    assert service.get_state(client_id="client-1")["state"] == "idle"


def test_config_validation_rejects_runtime_mock_nav_provider(tmp_path: Path):
    svc = ConfigService(config_path=tmp_path / "ragflow_config.json", backup_dir=tmp_path / "backups")

    result = svc.validate({"nav": {"provider": "mock"}})

    assert result.ok is False
    assert "nav.provider_invalid" in result.errors


def test_config_validation_rejects_http_without_base_url(tmp_path: Path):
    svc = ConfigService(config_path=tmp_path / "ragflow_config.json", backup_dir=tmp_path / "backups")

    result = svc.validate({"nav": {"provider": "http", "http": {"base_url": ""}}})

    assert result.ok is False
    assert "nav.http.base_url_empty" in result.errors
