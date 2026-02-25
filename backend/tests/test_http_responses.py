from __future__ import annotations

from flask import Flask

from backend.api.http_responses import bad_request_json, error_json, ok_json, unauthorized_json


def test_ok_json_sets_ok_true():
    app = Flask(__name__)
    with app.app_context():
        resp = ok_json(x=1)
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True
        assert resp.get_json()["x"] == 1


def test_error_helpers_status_and_payload():
    app = Flask(__name__)
    with app.app_context():
        resp, code = error_json(error="e1", status=418, foo=1)
        assert code == 418
        assert resp.get_json()["ok"] is False
        assert resp.get_json()["error"] == "e1"
        assert resp.get_json()["foo"] == 1

        resp2, code2 = bad_request_json(error="bad")
        assert code2 == 400
        assert resp2.get_json()["error"] == "bad"

        resp3, code3 = unauthorized_json()
        assert code3 == 401
        assert resp3.get_json()["error"] == "unauthorized"
