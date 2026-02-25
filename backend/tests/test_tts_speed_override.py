from __future__ import annotations

from backend.config.tts_resolver import resolve_tts_request


class _Headers(dict):
    def get(self, key, default=None):  # type: ignore[override]
        return super().get(key, default)


def test_tts_speed_override_bailian():
    cfg = {"tts": {"bailian": {"speech_rate": 1.0}}}
    provider, out = resolve_tts_request(cfg, data={"tts_provider": "modelscope", "tts_speed": 1.5}, headers=_Headers())
    assert provider == "modelscope"
    assert out is not cfg
    assert float(out["tts"]["bailian"]["speech_rate"]) == 1.5


def test_tts_speed_override_edge_rate_percent():
    cfg = {"tts": {"edge": {"rate": "0%"}}}
    provider, out = resolve_tts_request(cfg, data={"tts_provider": "edge", "tts_speed": 1.25}, headers=_Headers())
    assert provider == "edge"
    assert out is not cfg
    assert out["tts"]["edge"]["rate"] == "+25%"


def test_tts_speed_override_sapi_rate_int():
    cfg = {"tts": {"sapi": {"rate": 0}}}
    provider, out = resolve_tts_request(cfg, data={"tts_provider": "sapi", "tts_speed": 1.5}, headers=_Headers())
    assert provider == "sapi"
    assert out is not cfg
    assert int(out["tts"]["sapi"]["rate"]) == 5
