from __future__ import annotations

import pytest

from backend.config.tts_resolver import resolve_tts_request


class _Headers(dict):
    def get(self, k, default=None):  # noqa: A003
        return super().get(k, default)


def test_resolve_tts_request_provider_precedence_data_over_header_over_config():
    base = {"tts": {"provider": "edge"}}
    provider, cfg = resolve_tts_request(base, data={"tts_provider": "sapi"}, headers=_Headers({"X-TTS-Provider": "modelscope"}))
    assert provider == "sapi"
    assert cfg is base

    provider2, cfg2 = resolve_tts_request(base, data={}, headers=_Headers({"X-TTS-Provider": "modelscope"}))
    assert provider2 == "modelscope"
    assert cfg2 is base

    provider3, cfg3 = resolve_tts_request(base, data={}, headers=_Headers({}))
    assert provider3 == "edge"
    assert cfg3 is base


def test_resolve_tts_request_flash_preset_sets_model_and_voice():
    base = {"tts": {"bailian": {"voice": "v0"}}}
    provider, cfg = resolve_tts_request(base, data={"tts_provider": "flash"}, headers=_Headers({}))
    assert provider == "flash"
    assert cfg is not base
    assert cfg["tts"]["bailian"]["model"] == "cosyvoice-v3-flash"
    assert cfg["tts"]["bailian"]["voice"] == "longanyang"
    assert base.get("tts", {}).get("bailian", {}).get("model") is None


def test_resolve_tts_request_modelscope_does_not_default_voice_when_missing():
    base = {"tts": {"bailian": {"api_key": "k"}}}
    provider, cfg = resolve_tts_request(base, data={"tts_provider": "modelscope"}, headers=_Headers({}))
    assert provider == "modelscope"
    assert cfg is base
    assert base["tts"]["bailian"].get("voice") is None


def test_resolve_tts_request_rejects_invalid_speed_instead_of_ignoring_it():
    base = {"tts": {"provider": "edge"}}

    with pytest.raises(ValueError, match="invalid_tts_speed"):
        resolve_tts_request(base, data={"tts_speed": "fast"}, headers=_Headers({}))

    with pytest.raises(ValueError, match="invalid_tts_speed"):
        resolve_tts_request(base, data={"tts_speed": 99}, headers=_Headers({}))


def test_resolve_tts_request_bailian_voice_model_override_and_speed():
    base = {"tts": {"bailian": {"voice": "v0", "model": "m0", "speech_rate": 1.2}}}
    provider, cfg = resolve_tts_request(
        base,
        data={"tts_provider": "modelscope", "tts_voice": "v1", "tts_model": "m1", "tts_speed": 2},
        headers=_Headers({}),
    )
    assert provider == "modelscope"
    assert cfg is not base
    assert cfg["tts"]["bailian"]["voice"] == "v1"
    assert cfg["tts"]["bailian"]["model"] == "m1"
    assert abs(float(cfg["tts"]["bailian"]["speech_rate"]) - 2.0) < 1e-6  # clamped to 2.0
    assert base["tts"]["bailian"]["voice"] == "v0"


def test_resolve_tts_request_edge_speed_updates_rate_string_without_deepcopy():
    base = {"tts": {"edge": {"rate": "+10%"}, "other": {"x": 1}}}
    provider, cfg = resolve_tts_request(base, data={"tts_provider": "edge", "tts_speed": 0.5}, headers=_Headers({}))
    assert provider == "edge"
    assert cfg is not base
    assert cfg["tts"]["edge"]["rate"] == "-40%"  # +10% + (-50%) => -40%
    assert cfg["tts"]["other"] is base["tts"]["other"]  # untouched subtree is reused


def test_resolve_tts_request_rejects_invalid_bailian_base_speech_rate():
    base = {"tts": {"bailian": {"speech_rate": "quick"}}}

    with pytest.raises(ValueError, match="invalid_tts_bailian_speech_rate"):
        resolve_tts_request(base, data={"tts_provider": "modelscope", "tts_speed": 1.5}, headers=_Headers({}))


def test_resolve_tts_request_rejects_invalid_edge_base_rate():
    base = {"tts": {"edge": {"rate": "quick"}}}

    with pytest.raises(ValueError, match="invalid_tts_edge_rate"):
        resolve_tts_request(base, data={"tts_provider": "edge", "tts_speed": 1.5}, headers=_Headers({}))


def test_resolve_tts_request_rejects_invalid_sapi_base_rate():
    base = {"tts": {"sapi": {"rate": "quick"}}}

    with pytest.raises(ValueError, match="invalid_tts_sapi_rate"):
        resolve_tts_request(base, data={"tts_provider": "sapi", "tts_speed": 1.5}, headers=_Headers({}))


def test_resolve_tts_request_sapi_speed_updates_valid_base_rate():
    base = {"tts": {"sapi": {"rate": 2}}}

    provider, cfg = resolve_tts_request(base, data={"tts_provider": "sapi", "tts_speed": 1.5}, headers=_Headers({}))

    assert provider == "sapi"
    assert cfg is not base
    assert cfg["tts"]["sapi"]["rate"] == 7
    assert base["tts"]["sapi"]["rate"] == 2
