from __future__ import annotations

import pytest
from flask import Flask, request

from backend.api.request_validators import json_body_dict, parse_int_or_default


def test_json_body_dict_returns_dict_for_object_body():
    app = Flask(__name__)
    with app.test_request_context("/x", method="POST", json={"a": 1}):
        assert json_body_dict(request) == {"a": 1}


def test_json_body_dict_returns_empty_only_for_missing_body():
    app = Flask(__name__)
    with app.test_request_context("/x", method="POST"):
        assert json_body_dict(request) == {}


def test_json_body_dict_rejects_json_array_body():
    app = Flask(__name__)
    with app.test_request_context("/x", method="POST", data="[]", content_type="application/json"):
        with pytest.raises(ValueError, match="json_body_must_be_object"):
            json_body_dict(request)


def test_json_body_dict_rejects_malformed_json_body():
    app = Flask(__name__)
    with app.test_request_context("/x", method="POST", data="{bad", content_type="application/json"):
        with pytest.raises(ValueError, match="invalid_json"):
            json_body_dict(request)


def test_parse_int_or_default_with_bounds():
    assert parse_int_or_default("10", default=1) == 10
    assert parse_int_or_default(None, default=3) == 3
    assert parse_int_or_default("", default=3) == 3
    with pytest.raises(ValueError, match="invalid_integer"):
        parse_int_or_default("x", default=3)
    with pytest.raises(ValueError, match="integer_below_min"):
        parse_int_or_default("0", default=3, min_value=1)
    with pytest.raises(ValueError, match="integer_above_max"):
        parse_int_or_default("999", default=3, max_value=100)
