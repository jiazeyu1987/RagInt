from __future__ import annotations

from flask import Flask

from backend.api.speech_request import parse_ask_request


class _Deps:
    ragflow_default_chat_name = "default"


def test_parse_ask_request_missing_question_returns_400():
    app = Flask(__name__)
    with app.test_request_context("/api/ask", method="POST", json={"x": 1}):
        parsed, err = parse_ask_request(deps=_Deps(), data={"x": 1})
        assert parsed is None
        assert err is not None
        assert err.status_code == 400


def test_parse_ask_request_parses_kind_and_save_history():
    app = Flask(__name__)
    with app.test_request_context("/api/ask", method="POST", json={"question": "hi", "kind": "ask_prefetch"}):
        parsed, err = parse_ask_request(deps=_Deps(), data={"question": "hi", "kind": "ask_prefetch"})
        assert err is None
        assert parsed is not None
        assert parsed.kind == "ask_prefetch"
        assert parsed.save_history is False
        assert parsed.conversation_name == "default"


def test_parse_ask_request_parses_stop_index_and_action_type_defaults():
    app = Flask(__name__)
    data = {"question": "hi", "guide": {"tour_action": "next", "stop_index": "2"}}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert err is None
        assert parsed is not None
        assert parsed.stop_index == 2
        assert parsed.action_type == "切站"


def test_parse_ask_request_parses_tts_profile_fields():
    app = Flask(__name__)
    data = {"question": "hi", "tts_provider": "modelscope", "tts_voice": "voice-x", "tts_speed": 1.5}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert err is None
        assert parsed is not None
        assert parsed.tts_provider == "modelscope"
        assert parsed.tts_voice == "voice-x"
        assert abs(float(parsed.tts_speed) - 1.5) < 1e-6


def test_parse_ask_request_supports_tts_speed_header_fallback():
    app = Flask(__name__)
    data = {"question": "hi", "tts_provider": "modelscope"}
    with app.test_request_context("/api/ask", method="POST", json=data, headers={"X-TTS-Speed": "1.25"}):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert err is None
        assert parsed is not None
        assert abs(float(parsed.tts_speed) - 1.25) < 1e-6


def test_parse_ask_request_parses_qa_answer_target_chars():
    app = Flask(__name__)
    data = {"question": "hi", "qa_answer_target_chars": "220"}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert err is None
        assert parsed is not None
        assert parsed.qa_answer_target_chars == 220


def test_parse_ask_request_parses_qa_audio_cache_confidence_threshold():
    app = Flask(__name__)
    data = {"question": "hi", "qa_audio_cache_confidence_threshold": "0.66"}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert err is None
        assert parsed is not None
        assert abs(float(parsed.qa_audio_cache_confidence_threshold) - 0.66) < 1e-6


def test_parse_ask_request_parses_qa_audio_cache_lookup_enabled():
    app = Flask(__name__)
    data = {"question": "hi", "qa_audio_cache_lookup_enabled": "0"}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert err is None
        assert parsed is not None
        assert parsed.qa_audio_cache_lookup_enabled is False


def test_parse_ask_request_disables_qa_audio_cache_lookup_for_tour_action():
    app = Flask(__name__)
    data = {
        "question": "hi",
        "qa_audio_cache_lookup_enabled": "1",
        "guide": {"tour_action": "start", "stop_index": "0"},
    }
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert err is None
        assert parsed is not None
        assert parsed.tour_action == "start"
        assert parsed.qa_audio_cache_lookup_enabled is False


def test_parse_ask_request_rejects_non_object_guide():
    app = Flask(__name__)
    data = {"question": "hi", "guide": []}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert parsed is None
        assert err is not None
        assert err.status_code == 400


def test_parse_ask_request_rejects_invalid_numeric_fields():
    app = Flask(__name__)
    data = {"question": "hi", "tts_speed": "fast"}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert parsed is None
        assert err is not None
        assert err.status_code == 400


def test_parse_ask_request_rejects_invalid_header_tts_speed():
    app = Flask(__name__)
    data = {"question": "hi"}
    with app.test_request_context("/api/ask", method="POST", json=data, headers={"X-TTS-Speed": "fast"}):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert parsed is None
        assert err is not None
        assert err.status_code == 400


def test_parse_ask_request_rejects_invalid_bool_fields():
    app = Flask(__name__)
    data = {"question": "hi", "qa_audio_cache_lookup_enabled": "maybe"}
    with app.test_request_context("/api/ask", method="POST", json=data):
        parsed, err = parse_ask_request(deps=_Deps(), data=data)
        assert parsed is None
        assert err is not None
        assert err.status_code == 400
