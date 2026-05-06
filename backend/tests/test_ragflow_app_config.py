from __future__ import annotations

import pytest

from backend.config import RagflowAppConfig


def test_ragflow_app_config_dashscope_api_key_prefers_asr_then_tts():
    cfg = RagflowAppConfig.from_any({"asr": {"dashscope": {"api_key": "k1"}}, "tts": {"bailian": {"api_key": "k2"}}})
    assert cfg.dashscope_api_key() == "k1"

    cfg2 = RagflowAppConfig.from_any({"asr": {"dashscope": {}}, "tts": {"bailian": {"api_key": "k2"}}})
    assert cfg2.dashscope_api_key() == "k2"


def test_ragflow_app_config_tour_templates_parses_and_rejects_bad_shape():
    with pytest.raises(TypeError, match="tour_templates\\[\\] must be an object"):
        RagflowAppConfig.from_any(
            {
                "tour_templates": [
                    {"id": "t1", "name": "T1", "stops": ["a", "b"]},
                    {"name": "no_stops"},
                    "bad",
                ]
            }
        )


def test_ragflow_app_config_tour_templates_parses_and_keeps_valid_entries():
    cfg = RagflowAppConfig.from_any(
        {"tour_templates": [{"id": "t1", "name": "T1", "stops": ["a", "b"]}, {"name": "no_stops"}]}
    )
    assert [t.id for t in cfg.tour_templates] == ["t1"]
    assert cfg.tour_templates[0].stops == ["a", "b"]


def test_ragflow_app_config_nav_defaults_and_clamps():
    cfg = RagflowAppConfig.from_any({"nav": {"provider": "http", "timeout_s": 1, "http": {"poll_interval_ms": 9999}}})
    assert cfg.nav.provider == "http"
    assert cfg.nav.timeout_s >= 5.0
    assert cfg.nav.http.poll_interval_ms == 2000


def test_ragflow_app_config_rejects_invalid_numeric_values():
    with pytest.raises(ValueError, match="nav\\.timeout_s must be a number"):
        RagflowAppConfig.from_any({"nav": {"timeout_s": "bad"}})


def test_ragflow_app_config_rejects_non_finite_edge_timeout():
    with pytest.raises(ValueError, match="tts\\.edge\\.timeout_s must be a finite number"):
        RagflowAppConfig.from_any({"tts": {"edge": {"timeout_s": "NaN"}}})


def test_ragflow_app_config_rejects_fractional_integer_fields():
    with pytest.raises(ValueError, match="tts\\.edge\\.queue_max_chunks must be an integer"):
        RagflowAppConfig.from_any({"tts": {"edge": {"queue_max_chunks": 16.5}}})


def test_ragflow_app_config_rejects_invalid_edge_percent_values():
    with pytest.raises(ValueError, match="tts\\.edge\\.rate must be a signed percent"):
        RagflowAppConfig.from_any({"tts": {"edge": {"rate": "quick"}}})

    with pytest.raises(ValueError, match="tts\\.edge\\.volume must be a signed percent"):
        RagflowAppConfig.from_any({"tts": {"edge": {"volume": ""}}})


def test_ragflow_app_config_rejects_invalid_boolean_values():
    with pytest.raises(ValueError, match="tts\\.edge\\.enabled must be a boolean"):
        RagflowAppConfig.from_any({"tts": {"edge": {"enabled": "maybe"}}})


def test_ragflow_app_config_parses_explicit_boolean_values():
    cfg = RagflowAppConfig.from_any({"tts": {"edge": {"enabled": "false"}}})
    assert cfg.tts_edge.enabled is False
