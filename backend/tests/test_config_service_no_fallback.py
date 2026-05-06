from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.services.config_service import ConfigService


def _svc(tmp_path: Path) -> ConfigService:
    return ConfigService(config_path=tmp_path / "ragflow_config.json", backup_dir=tmp_path / "backups")


def test_missing_config_file_is_legal_initialization(tmp_path: Path):
    service = _svc(tmp_path)

    assert service.load_raw() == {}
    assert service.export_public() == {"ok": True, "config": {}, "secrets_stripped": True}


def test_damaged_json_config_fails_fast_instead_of_exporting_empty_config(tmp_path: Path):
    service = _svc(tmp_path)
    service.config_path.write_text("{bad json", encoding="utf-8")

    with pytest.raises(json.JSONDecodeError):
        service.export_public()


def test_non_object_config_fails_fast_instead_of_exporting_empty_config(tmp_path: Path):
    service = _svc(tmp_path)
    service.config_path.write_text('["not", "a", "config"]', encoding="utf-8")

    with pytest.raises(ValueError, match="config_not_object"):
        service.export_public()


def test_scrub_rejects_non_object_instead_of_returning_empty_config():
    with pytest.raises(ValueError, match="config_not_object"):
        ConfigService.scrub_secrets(["not", "a", "config"])  # type: ignore[arg-type]


def test_validate_rejects_invalid_numeric_fields_instead_of_warning_and_importing(tmp_path: Path):
    service = _svc(tmp_path)

    validation = service.validate({"timeout": "bad", "max_retries": "NaN"})

    assert validation.ok is False
    assert "timeout_not_int" in validation.errors
    assert "max_retries_not_int" in validation.errors
    assert validation.warnings == []
    assert service.import_config({"timeout": "bad"})["ok"] is False

    fractional = service.validate({"timeout": 1.5})
    assert fractional.ok is False
    assert fractional.errors == ["timeout_not_int"]


def test_backup_listing_stat_failure_is_not_silently_skipped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    service = _svc(tmp_path)
    service.backup_dir.mkdir(parents=True)
    broken = service.backup_dir / "ragflow_config.20260506_120000.json"
    broken.write_text("{}", encoding="utf-8")

    original_stat = Path.stat

    def stat_or_fail(path: Path, *args, **kwargs):
        if path == broken:
            raise OSError("stat failed")
        return original_stat(path, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", stat_or_fail)

    with pytest.raises(OSError, match="stat failed"):
        service.list_backups()
