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

