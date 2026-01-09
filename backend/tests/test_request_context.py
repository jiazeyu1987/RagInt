from __future__ import annotations

from backend.api.request_context import get_client_id, get_request_id


class _Req:
    def __init__(self, *, headers=None, remote_addr=None):
        self.headers = headers or {}
        self.remote_addr = remote_addr


def test_request_id_from_header():
    req = _Req(headers={"X-Request-ID": "rid_123"})
    rid = get_request_id(req, data=None, form=None, prefix="ask")
    assert rid == "rid_123"


def test_request_id_autogen_prefix():
    req = _Req(headers={})
    rid = get_request_id(req, data=None, form=None, prefix="tts")
    assert rid.startswith("tts_")


def test_client_id_from_header():
    req = _Req(headers={"X-Client-ID": "cid_1"})
    cid = get_client_id(req, data=None, form=None, default="-")
    assert cid == "cid_1"


def test_client_id_from_remote_addr():
    req = _Req(headers={}, remote_addr="127.0.0.1")
    cid = get_client_id(req, data=None, form=None, default="-")
    assert cid == "127.0.0.1"

