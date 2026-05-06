from __future__ import annotations

from pathlib import Path

import pytest

from backend.adapters.nav_provider import build_nav_provider
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
