from __future__ import annotations

import pytest

from backend.config.env import env_bool, env_float, env_int


def test_env_helpers_keep_defaults_when_env_missing(monkeypatch):
    monkeypatch.delenv("RAGINT_TEST_INT", raising=False)
    monkeypatch.delenv("RAGINT_TEST_FLOAT", raising=False)
    monkeypatch.delenv("RAGINT_TEST_BOOL", raising=False)

    assert env_int("RAGINT_TEST_INT", 12) == 12
    assert env_float("RAGINT_TEST_FLOAT", 1.5) == 1.5
    assert env_bool("RAGINT_TEST_BOOL", True) is True


def test_env_helpers_reject_explicit_invalid_values(monkeypatch):
    monkeypatch.setenv("RAGINT_TEST_INT", "abc")
    monkeypatch.setenv("RAGINT_TEST_FLOAT", "not-a-float")
    monkeypatch.setenv("RAGINT_TEST_BOOL", "maybe")

    with pytest.raises(ValueError, match="RAGINT_TEST_INT"):
        env_int("RAGINT_TEST_INT", 12)
    with pytest.raises(ValueError, match="RAGINT_TEST_FLOAT"):
        env_float("RAGINT_TEST_FLOAT", 1.5)
    with pytest.raises(ValueError, match="RAGINT_TEST_BOOL"):
        env_bool("RAGINT_TEST_BOOL", False)
