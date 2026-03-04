from __future__ import annotations

from backend.services.app_settings_store import AppSettingsStore


def test_app_settings_store_roundtrip(tmp_path):
    store = AppSettingsStore(tmp_path / "app_settings.db")

    assert store.get(scope_id="cid_test") is None

    rec = store.upsert(scope_id="cid_test", settings={"wakeWord": "你好小D", "asrMinRecordMs": 900}, now_ms=123)
    assert rec is not None
    assert rec.scope_id == "cid_test"
    assert rec.settings["wakeWord"] == "你好小D"
    assert rec.created_at_ms == 123
    assert rec.updated_at_ms == 123

    rec2 = store.upsert(scope_id="cid_test", settings={"wakeWord": "你好小R"}, now_ms=456)
    assert rec2 is not None
    assert rec2.created_at_ms == 123
    assert rec2.updated_at_ms == 456
    assert rec2.settings == {"wakeWord": "你好小R"}
