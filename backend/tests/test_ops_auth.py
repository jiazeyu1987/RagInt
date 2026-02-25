from __future__ import annotations

import os
from types import SimpleNamespace

from backend.api.ops_auth import OpsAuth


class _OpsStore:
    def __init__(self, valid_device_token="tok1"):
        self.valid_device_token = valid_device_token

    def verify_device_token(self, *, device_id: str, token: str):
        return bool(device_id) and token == self.valid_device_token


class _Deps:
    def __init__(self):
        self.ops_store = _OpsStore()


def _req(headers=None):
    return SimpleNamespace(headers=dict(headers or {}))


def test_ops_auth_role_admin_and_view_tokens():
    os.environ["RAGINT_OPS_ADMIN_TOKEN"] = "a1"
    os.environ["RAGINT_OPS_VIEW_TOKEN"] = "v1"
    os.environ.pop("RAGINT_DEVICE_AUTH_REQUIRED", None)

    assert OpsAuth.role(_req({"X-Ops-Token": "a1"})) == "admin"
    assert OpsAuth.role(_req({"X-Ops-Token": "v1"})) == "view"
    assert OpsAuth.role(_req({"X-Ops-Token": "x"})) is None


def test_ops_auth_disabled_when_no_tokens_and_no_device_auth():
    os.environ.pop("RAGINT_OPS_ADMIN_TOKEN", None)
    os.environ.pop("RAGINT_OPS_VIEW_TOKEN", None)
    os.environ.pop("RAGINT_OPS_TOKEN", None)
    os.environ["RAGINT_DEVICE_AUTH_REQUIRED"] = "0"

    assert OpsAuth.auth_disabled() is True
    assert OpsAuth.require_admin(_req()) is True


def test_device_token_and_shared_secret_checks():
    os.environ["RAGINT_DEVICE_SHARED_SECRET"] = "sec1"
    deps = _Deps()
    req = _req({"X-Device-Shared-Secret": "sec1", "X-Device-Token": "tok1"})

    assert OpsAuth.device_shared_secret_ok(req, {}) is True
    assert OpsAuth.device_token_ok(req, deps=deps, device_id="d1", data={}) is True
