from __future__ import annotations

import sqlite3

import pytest

from backend.services.app_settings_store import AppSettingsStore


def test_app_settings_store_roundtrip(tmp_path):
    store = AppSettingsStore(tmp_path / "app_settings.db")

    assert store.get(scope_id="cid_test") is None

    rec = store.upsert(scope_id="cid_test", settings={"wakeWord": "w1", "asrMinRecordMs": 900}, now_ms=123)
    assert rec is not None
    assert rec.scope_id == "cid_test"
    assert rec.settings["wakeWord"] == "w1"
    assert rec.created_at_ms == 123
    assert rec.updated_at_ms == 123

    rec2 = store.upsert(scope_id="cid_test", settings={"wakeWord": "w2"}, now_ms=456)
    assert rec2 is not None
    assert rec2.created_at_ms == 123
    assert rec2.updated_at_ms == 456
    assert rec2.settings == {"wakeWord": "w2"}

    latest = store.get_latest()
    assert latest is not None
    assert latest.scope_id == "cid_test"
    assert latest.updated_at_ms == 456


def test_app_settings_store_get_latest_prefers_recent_update(tmp_path):
    store = AppSettingsStore(tmp_path / "app_settings.db")
    assert store.get_latest() is None

    store.upsert(scope_id="s1", settings={"a": 1}, now_ms=100)
    store.upsert(scope_id="s2", settings={"b": 2}, now_ms=200)

    latest = store.get_latest()
    assert latest is not None
    assert latest.scope_id == "s2"
    assert latest.settings == {"b": 2}


def test_app_settings_store_rejects_corrupt_settings_json(tmp_path):
    db_path = tmp_path / "app_settings.db"
    store = AppSettingsStore(db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            "INSERT INTO app_settings (scope_id, settings_json, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?)",
            ("bad", "{", 1, 1),
        )
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError):
        store.get(scope_id="bad")


def test_app_settings_store_rejects_non_object_settings_json(tmp_path):
    db_path = tmp_path / "app_settings.db"
    store = AppSettingsStore(db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            "INSERT INTO app_settings (scope_id, settings_json, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?)",
            ("bad", "[]", 1, 1),
        )
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(ValueError, match="app_settings_json_invalid"):
        store.get(scope_id="bad")
