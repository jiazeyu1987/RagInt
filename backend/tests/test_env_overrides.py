from __future__ import annotations

import pytest

from backend.services.env_overrides import apply_env_overrides


def test_apply_env_overrides_maps_bailian_runtime_fields(monkeypatch):
    monkeypatch.setenv("BAILIAN_API_KEY", "k1")
    monkeypatch.setenv("BAILIAN_TTS_VOICE", "longxiaochun")
    monkeypatch.setenv("BAILIAN_TTS_MODEL", "cosyvoice-v3-plus")
    monkeypatch.setenv("BAILIAN_TTS_SPEECH_RATE", "1.2")

    out = apply_env_overrides({})
    bailian = ((out.get("tts") or {}).get("bailian") or {})

    assert bailian.get("api_key") == "k1"
    assert bailian.get("voice") == "longxiaochun"
    assert bailian.get("model") == "cosyvoice-v3-plus"
    assert abs(float(bailian.get("speech_rate")) - 1.2) < 1e-6


@pytest.mark.parametrize(
    ("env_key", "env_value"),
    [
        ("BAILIAN_TTS_SPEECH_RATE", "fast"),
        ("NAV_TIMEOUT_S", "soon"),
        ("NAV_HTTP_POLL_INTERVAL_MS", "ten"),
        ("NAV_MOCK_ARRIVE_DELAY_MS", "later"),
    ],
)
def test_apply_env_overrides_fails_fast_on_invalid_numeric_values(monkeypatch, env_key, env_value):
    monkeypatch.setenv(env_key, env_value)

    with pytest.raises(ValueError, match=env_key):
        apply_env_overrides({})
