from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.services.offline_script_service import OfflineScriptService


def _service(tmp_path: Path) -> OfflineScriptService:
    return OfflineScriptService(manifest_path=tmp_path / "manifest.json", audio_dir=tmp_path / "audio")


def test_load_manifest_fails_when_manifest_is_missing(tmp_path: Path):
    service = _service(tmp_path)

    with pytest.raises(FileNotFoundError, match="offline_manifest_missing"):
        service.load_manifest()


def test_load_manifest_rejects_invalid_manifest_shape(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text("[]", encoding="utf-8")
    service = _service(tmp_path)

    with pytest.raises(ValueError, match="offline_manifest_invalid"):
        service.load_manifest()


def test_load_manifest_rejects_invalid_items_shape(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"items": {}}), encoding="utf-8")
    service = _service(tmp_path)

    with pytest.raises(ValueError, match="offline_manifest_invalid"):
        service.list_items()


def test_load_manifest_rejects_missing_items_list(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"ok": True}), encoding="utf-8")
    service = _service(tmp_path)

    with pytest.raises(ValueError, match="offline_manifest_invalid"):
        service.load_manifest()


def test_list_items_rejects_non_object_item(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"items": ["skip-me"]}), encoding="utf-8")
    service = _service(tmp_path)

    with pytest.raises(ValueError, match="offline_manifest_invalid"):
        service.list_items()


def test_list_items_rejects_missing_required_item_fields(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"items": [{"filename": "a.wav"}]}), encoding="utf-8")
    service = _service(tmp_path)

    with pytest.raises(ValueError, match="offline_manifest_invalid"):
        service.list_items()


def test_list_items_rejects_invalid_numeric_item_fields(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps({"items": [{"id": "a", "filename": "a.wav", "order": "bad"}]}),
        encoding="utf-8",
    )
    service = _service(tmp_path)

    with pytest.raises(ValueError, match="offline_manifest_invalid"):
        service.list_items()


def test_list_items_keeps_real_empty_manifest_valid(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"items": []}), encoding="utf-8")
    service = _service(tmp_path)

    assert service.list_items() == []
