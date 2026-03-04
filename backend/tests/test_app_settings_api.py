from __future__ import annotations

import os

from backend.app import create_app


def test_app_settings_roundtrip(tmp_path):
    os.environ["RAGINT_APP_SETTINGS_DB_PATH"] = str(tmp_path / "app_settings.db")
    app = create_app()
    c = app.test_client()

    headers = {"X-Client-ID": "cid_settings_test"}

    r0 = c.get("/api/app_settings", headers=headers)
    assert r0.status_code == 200
    p0 = r0.get_json()
    assert p0["ok"] is True
    assert p0["settings"] == {}

    r1 = c.put(
        "/api/app_settings",
        headers=headers,
        json={
            "settings": {
                "wakeWordEnabled": True,
                "asrStopGraceMs": 480,
                "asrTextFilterPrompt": "demo",
            }
        },
    )
    assert r1.status_code == 200
    p1 = r1.get_json()
    assert p1["ok"] is True
    assert p1["settings"]["wakeWordEnabled"] is True

    r2 = c.get("/api/app_settings", headers=headers)
    assert r2.status_code == 200
    p2 = r2.get_json()
    assert p2["settings"]["asrStopGraceMs"] == 480
    assert p2["scope_id"] == "cid_settings_test"


def test_app_settings_requires_dict(tmp_path):
    os.environ["RAGINT_APP_SETTINGS_DB_PATH"] = str(tmp_path / "app_settings.db")
    app = create_app()
    c = app.test_client()

    r = c.put("/api/app_settings", headers={"X-Client-ID": "cid_settings_test"}, json={"settings": []})
    assert r.status_code == 400
    assert r.get_json()["error"] == "settings_dict_required"
