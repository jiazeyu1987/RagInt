from __future__ import annotations

from backend.config import RagflowAppConfig


def test_ragflow_app_config_dashscope_api_key_prefers_asr_then_tts():
    cfg = RagflowAppConfig.from_any({"asr": {"dashscope": {"api_key": "k1"}}, "tts": {"bailian": {"api_key": "k2"}}})
    assert cfg.dashscope_api_key() == "k1"

    cfg2 = RagflowAppConfig.from_any({"asr": {"dashscope": {}}, "tts": {"bailian": {"api_key": "k2"}}})
    assert cfg2.dashscope_api_key() == "k2"


def test_ragflow_app_config_tour_templates_parses_and_filters():
    cfg = RagflowAppConfig.from_any(
        {
            "tour_templates": [
                {"id": "t1", "name": "T1", "stops": ["a", "b"]},
                {"name": "no_stops"},
                "bad",
            ]
        }
    )
    assert [t.id for t in cfg.tour_templates] == ["t1"]
    assert cfg.tour_templates[0].stops == ["a", "b"]


def test_ragflow_app_config_nav_defaults_and_clamps():
    cfg = RagflowAppConfig.from_any({"nav": {"provider": "http", "timeout_s": 1, "http": {"poll_interval_ms": 9999}}})
    assert cfg.nav.provider == "http"
    assert cfg.nav.timeout_s >= 5.0
    assert cfg.nav.http.poll_interval_ms == 2000

