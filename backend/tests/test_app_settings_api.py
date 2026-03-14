from __future__ import annotations

import os

from backend.app import create_app


def test_app_settings_roundtrip_single_user_scope(tmp_path):
    os.environ["RAGINT_APP_SETTINGS_DB_PATH"] = str(tmp_path / "app_settings.db")
    app = create_app()
    c = app.test_client()

    headers_a = {"X-Client-ID": "cid_a"}
    headers_b = {"X-Client-ID": "cid_b"}

    r0 = c.get("/api/app_settings", headers=headers_a)
    assert r0.status_code == 200
    p0 = r0.get_json()
    assert p0["ok"] is True
    assert p0["settings"] == {}
    assert p0["scope_id"] == "single_user"

    r1 = c.put(
        "/api/app_settings",
        headers=headers_a,
        json={"settings": {"wakeWordEnabled": True, "asrStopGraceMs": 480}},
    )
    assert r1.status_code == 200
    p1 = r1.get_json()
    assert p1["ok"] is True
    assert p1["scope_id"] == "single_user"

    r2 = c.get("/api/app_settings", headers=headers_b)
    assert r2.status_code == 200
    p2 = r2.get_json()
    assert p2["scope_id"] == "single_user"
    assert p2["settings"]["wakeWordEnabled"] is True
    assert p2["settings"]["asrStopGraceMs"] == 480


def test_app_settings_bootstrap_from_latest_scope(tmp_path):
    os.environ["RAGINT_APP_SETTINGS_DB_PATH"] = str(tmp_path / "app_settings.db")
    app = create_app()
    c = app.test_client()

    deps = app.config["deps"]
    store = deps.app_settings_store
    store.upsert(scope_id="old_a", settings={"v": 1}, now_ms=100)
    store.upsert(scope_id="old_b", settings={"v": 2}, now_ms=200)

    r = c.get("/api/app_settings", headers={"X-Client-ID": "any"})
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["scope_id"] == "single_user"
    assert payload["settings"] == {"v": 2}

    migrated = store.get(scope_id="single_user")
    assert migrated is not None
    assert migrated.settings == {"v": 2}


def test_app_settings_requires_dict(tmp_path):
    os.environ["RAGINT_APP_SETTINGS_DB_PATH"] = str(tmp_path / "app_settings.db")
    app = create_app()
    c = app.test_client()

    r = c.put("/api/app_settings", headers={"X-Client-ID": "cid_settings_test"}, json={"settings": []})
    assert r.status_code == 400
    assert r.get_json()["error"] == "settings_dict_required"
