from __future__ import annotations

from backend.app import create_app


def test_wake_word_detect_api():
    app = create_app()
    c = app.test_client()

    r = c.post(
        "/api/wake_word/detect",
        headers={"X-Client-ID": "cid_test"},
        json={"text": "你好小R", "wake_words": ["你好小R"], "cooldown_ms": 0, "match_mode": "prefix"},
    )
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["ok"] is True
    assert payload["detected"] is True
    assert payload["wake_word"] == "你好小r"
    assert payload["reason"] == "detected"
