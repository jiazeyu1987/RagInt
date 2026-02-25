from __future__ import annotations

from flask import Flask, request

from backend.api.request_validators import json_body_dict, parse_int_or_default


def test_json_body_dict_returns_dict_or_empty():
    app = Flask(__name__)
    with app.test_request_context("/x", method="POST", json={"a": 1}):
        assert json_body_dict(request) == {"a": 1}
    with app.test_request_context("/x", method="POST", data="[]", content_type="application/json"):
        assert json_body_dict(request) == {}


def test_parse_int_or_default_with_bounds():
    assert parse_int_or_default("10", default=1) == 10
    assert parse_int_or_default("x", default=3) == 3
    assert parse_int_or_default("0", default=3, min_value=1) == 1
    assert parse_int_or_default("999", default=3, max_value=100) == 100
