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


def test_modelscope_missing_config_falls_back_to_edge(monkeypatch):
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

    out = list(
        registry.stream_tts(
            text="hello",
            request_id="r1",
            config={"tts": {"edge": {"enabled": True}, "sapi": {"enabled": True}}},
            provider="modelscope",
            logger=_Logger(),
        )
    )
    assert out == [b"edge-bytes"]
    assert called == {"bailian": 1, "edge": 1, "sapi": 0}


def test_modelscope_missing_config_falls_back_to_sapi_when_edge_unavailable(monkeypatch):
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

    out = list(
        registry.stream_tts(
            text="hello",
            request_id="r2",
            config={"tts": {"edge": {"enabled": True}, "sapi": {"enabled": True}}},
            provider="modelscope",
            logger=_Logger(),
        )
    )
    assert out == [b"sapi-bytes"]
    assert called == {"bailian": 1, "edge": 1, "sapi": 1}
