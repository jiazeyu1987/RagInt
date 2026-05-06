from __future__ import annotations

import pytest

from backend.api.request_context import get_client_id, get_request_id


class _Req:
    def __init__(self, *, headers=None, remote_addr=None):
        self.headers = headers or {}
        self.remote_addr = remote_addr


class _RaisingDict(dict):
    def __init__(self, message):
        super().__init__()
        self._message = message

    def get(self, *_args, **_kwargs):
        raise RuntimeError(self._message)


class _RaisingGet:
    def __init__(self, message):
        self._message = message

    def get(self, *_args, **_kwargs):
        raise RuntimeError(self._message)


class _ReqWithFailingRemoteAddr:
    headers = {}

    @property
    def remote_addr(self):
        raise RuntimeError("remote addr failed")


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


def test_client_id_missing_value_uses_contract_default():
    req = _Req(headers={}, remote_addr=None)
    cid = get_client_id(req, data=None, form=None, default="-")
    assert cid == "-"


def test_request_id_data_read_error_is_not_swallowed():
    req = _Req(headers={"X-Request-ID": "rid_123"})
    with pytest.raises(RuntimeError, match="request payload failed"):
        get_request_id(req, data=_RaisingDict("request payload failed"), form=None, prefix="ask")


def test_request_id_form_read_error_is_not_swallowed():
    req = _Req(headers={"X-Request-ID": "rid_123"})
    with pytest.raises(RuntimeError, match="request form failed"):
        get_request_id(req, data={}, form=_RaisingGet("request form failed"), prefix="ask")


def test_request_id_header_read_error_is_not_swallowed():
    req = _Req(headers=_RaisingGet("request header failed"))
    with pytest.raises(RuntimeError, match="request header failed"):
        get_request_id(req, data=None, form=None, prefix="ask")


def test_client_id_data_read_error_is_not_defaulted():
    req = _Req(headers={"X-Client-ID": "cid_1"})
    with pytest.raises(RuntimeError, match="client payload failed"):
        get_client_id(req, data=_RaisingDict("client payload failed"), form=None, default="-")


def test_client_id_form_read_error_is_not_defaulted():
    req = _Req(headers={"X-Client-ID": "cid_1"})
    with pytest.raises(RuntimeError, match="client form failed"):
        get_client_id(req, data={}, form=_RaisingGet("client form failed"), default="-")


def test_client_id_header_read_error_is_not_defaulted():
    req = _Req(headers=_RaisingGet("client header failed"), remote_addr="127.0.0.1")
    with pytest.raises(RuntimeError, match="client header failed"):
        get_client_id(req, data=None, form=None, default="-")


def test_client_id_remote_addr_read_error_is_not_defaulted():
    req = _ReqWithFailingRemoteAddr()
    with pytest.raises(RuntimeError, match="remote addr failed"):
        get_client_id(req, data=None, form=None, default="-")
