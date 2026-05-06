from __future__ import annotations

import logging

from backend.services.tts import registry


class _Logger(logging.Logger):
    def __init__(self):
        super().__init__("tts-registry-test")

    def info(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def warning(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def error(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


def test_modelscope_missing_config_fails_without_trying_edge_or_sapi(monkeypatch):
    called = {"bailian": 0, "edge": 0, "sapi": 0}

    def _bailian(**kwargs):  # noqa: ANN003
        called["bailian"] += 1
        raise ValueError("tts.bailian.api_key is required for bailian dashscope mode")

    def _edge(**kwargs):  # noqa: ANN003
        called["edge"] += 1
        yield b"edge-bytes"

    def _sapi(**kwargs):  # noqa: ANN003
        called["sapi"] += 1
        yield b"sapi-bytes"

    monkeypatch.setattr(registry, "stream_bailian_tts", _bailian)
    monkeypatch.setattr(registry, "stream_edge", _edge)
    monkeypatch.setattr(registry, "stream_sapi_tts", _sapi)

    try:
        list(
            registry.stream_tts(
                text="hello",
                request_id="r1",
                config={"tts": {"edge": {"enabled": True}, "sapi": {"enabled": True}}},
                provider="modelscope",
                logger=_Logger(),
            )
        )
    except ValueError as exc:
        assert "tts.bailian.api_key is required" in str(exc)
    else:
        raise AssertionError("expected missing modelscope config to fail fast")
    assert called == {"bailian": 1, "edge": 0, "sapi": 0}


def test_modelscope_missing_config_does_not_try_sapi_when_edge_unavailable(monkeypatch):
    called = {"bailian": 0, "edge": 0, "sapi": 0}

    def _bailian(**kwargs):  # noqa: ANN003
        called["bailian"] += 1
        raise ValueError("tts.bailian.api_key is required for bailian dashscope mode")

    def _edge(**kwargs):  # noqa: ANN003
        called["edge"] += 1
        raise RuntimeError("edge_tts_not_available")

    def _sapi(**kwargs):  # noqa: ANN003
        called["sapi"] += 1
        yield b"sapi-bytes"

    monkeypatch.setattr(registry, "stream_bailian_tts", _bailian)
    monkeypatch.setattr(registry, "stream_edge", _edge)
    monkeypatch.setattr(registry, "stream_sapi_tts", _sapi)

    try:
        list(
            registry.stream_tts(
                text="hello",
                request_id="r2",
                config={"tts": {"edge": {"enabled": True}, "sapi": {"enabled": True}}},
                provider="modelscope",
                logger=_Logger(),
            )
        )
    except ValueError as exc:
        assert "tts.bailian.api_key is required" in str(exc)
    else:
        raise AssertionError("expected missing modelscope config to fail fast")
    assert called == {"bailian": 1, "edge": 0, "sapi": 0}


def test_modelscope_invalid_parameter_fails_without_trying_edge(monkeypatch):
    called = {"bailian": 0, "edge": 0, "sapi": 0}

    def _bailian(**kwargs):  # noqa: ANN003
        called["bailian"] += 1
        raise RuntimeError(
            '{"header":{"error_code":"InvalidParameter","error_message":"[tts:]Engine return error code: 418"}}'
        )

    def _edge(**kwargs):  # noqa: ANN003
        called["edge"] += 1
        yield b"edge-bytes"

    def _sapi(**kwargs):  # noqa: ANN003
        called["sapi"] += 1
        yield b"sapi-bytes"

    monkeypatch.setattr(registry, "stream_bailian_tts", _bailian)
    monkeypatch.setattr(registry, "stream_edge", _edge)
    monkeypatch.setattr(registry, "stream_sapi_tts", _sapi)

    try:
        list(
            registry.stream_tts(
                text="hello",
                request_id="r3",
                config={"tts": {"edge": {"enabled": True}, "sapi": {"enabled": True}}},
                provider="modelscope",
                logger=_Logger(),
            )
        )
    except RuntimeError as exc:
        assert "InvalidParameter" in str(exc)
    else:
        raise AssertionError("expected invalid modelscope response to fail fast")
    assert called == {"bailian": 1, "edge": 0, "sapi": 0}


def test_unknown_tts_provider_fails_without_trying_sovtts1(monkeypatch):
    called = {"local": 0}

    def _local(**kwargs):  # noqa: ANN003
        called["local"] += 1
        yield b"local-bytes"

    monkeypatch.setattr(registry, "stream_local_gpt_sovits", _local)

    try:
        list(
            registry.stream_tts(
                text="hello",
                request_id="r4",
                config={},
                provider="mystery",
                logger=_Logger(),
            )
        )
    except ValueError as exc:
        assert "unknown_tts_provider:mystery" in str(exc)
    else:
        raise AssertionError("expected unknown provider to fail fast")
    assert called == {"local": 0}


def test_disabled_local_provider_fails_without_trying_modelscope(monkeypatch):
    called = {"bailian": 0, "local": 0}

    def _bailian(**kwargs):  # noqa: ANN003
        called["bailian"] += 1
        yield b"bailian-bytes"

    def _local(**kwargs):  # noqa: ANN003
        called["local"] += 1
        yield b"local-bytes"

    monkeypatch.setattr(registry, "stream_bailian_tts", _bailian)
    monkeypatch.setattr(registry, "stream_local_gpt_sovits", _local)

    try:
        list(
            registry.stream_tts(
                text="hello",
                request_id="r5",
                config={
                    "tts": {
                        "sovtts1": {"enabled": False},
                        "bailian": {"api_key": "k", "voice": "v"},
                    }
                },
                provider="sovtts1",
                logger=_Logger(),
            )
        )
    except ValueError as exc:
        assert "tts_provider_disabled:sovtts1" in str(exc)
    else:
        raise AssertionError("expected disabled local provider to fail fast")
    assert called == {"bailian": 0, "local": 0}
