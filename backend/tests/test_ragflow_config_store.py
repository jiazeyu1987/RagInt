from __future__ import annotations

import json
import sqlite3

import pytest

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


def test_ragflow_config_store_upsert_rejects_non_dict_config(tmp_path):
    store = RagflowConfigStore(tmp_path / "ragflow_config.db")

    with pytest.raises(TypeError, match="config must be a dict"):
        store.upsert(config=[])


@pytest.mark.parametrize("config_json", ["{bad", "[]", "null"])
def test_ragflow_config_store_exposes_invalid_stored_config_json(tmp_path, config_json):
    db_path = tmp_path / "ragflow_config.db"
    store = RagflowConfigStore(db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            """
            INSERT INTO ragflow_config (scope_id, config_json, created_at_ms, updated_at_ms)
            VALUES (?, ?, ?, ?)
            """,
            ("global", config_json, 1000, 1000),
        )
        conn.commit()
    finally:
        conn.close()

    with pytest.raises((json.JSONDecodeError, ValueError)):
        store.get()
