from __future__ import annotations

from backend.services.ragflow_config_store import RagflowConfigStore


def test_ragflow_config_store_roundtrip(tmp_path):
    store = RagflowConfigStore(tmp_path / "ragflow_config.db")

    rec0 = store.get()
    assert rec0 is None

    rec1 = store.upsert(config={"api_key": "k1", "base_url": "http://x"})
    assert rec1 is not None
    assert rec1.scope_id == "global"
    assert rec1.config["api_key"] == "k1"
    assert rec1.config["base_url"] == "http://x"

    rec2 = store.get()
    assert rec2 is not None
    assert rec2.config["api_key"] == "k1"
    assert rec2.updated_at_ms >= rec2.created_at_ms


def test_ragflow_config_store_upsert_updates_config_version_fields(tmp_path):
    store = RagflowConfigStore(tmp_path / "ragflow_config.db")
    rec1 = store.upsert(config={"k": "v1"}, now_ms=1000)
    rec2 = store.upsert(config={"k": "v2"}, now_ms=2000)
    assert rec1 is not None and rec2 is not None
    assert rec1.created_at_ms == 1000
    assert rec2.created_at_ms == 1000
    assert rec2.updated_at_ms == 2000
    assert rec2.config["k"] == "v2"
