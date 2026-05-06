from __future__ import annotations

import logging

import pytest

from backend.services.tts.providers import local_gpt_sovits


class _Response:
    def __init__(self, *, status_code=200, chunks=None, text=""):
        self.status_code = status_code
        self._chunks = list(chunks or [])
        self.text = text
        self.headers = {"Content-Type": "audio/wav"}
        self.closed = False

    def iter_content(self, chunk_size=4096):  # noqa: ARG002
        yield from self._chunks

    def close(self):
        self.closed = True


def test_sovtts1_uses_single_root_endpoint_without_api_v2_fallback(monkeypatch):
    calls: list[dict] = []

    def _post(url, **kwargs):  # noqa: ANN001, ANN003
        calls.append({"url": url, "json": kwargs.get("json")})
        return _Response(status_code=500, text="wrong endpoint")

    monkeypatch.setattr(local_gpt_sovits.requests, "post", _post)

    with pytest.raises(RuntimeError, match="local_tts_non_200:500"):
        list(
            local_gpt_sovits.stream_local_gpt_sovits(
                text="hello",
                request_id="r1",
                config={"tts": {"sovtts1": {"url": "http://127.0.0.1:9880/tts"}}},
                logger=logging.getLogger("test"),
                local_provider="sovtts1",
            )
        )

    assert [c["url"] for c in calls] == ["http://127.0.0.1:9880/"]
    assert "text_language" in calls[0]["json"]


def test_sovtts2_uses_single_tts_endpoint_without_root_fallback(monkeypatch):
    calls: list[dict] = []

    def _post(url, **kwargs):  # noqa: ANN001, ANN003
        calls.append({"url": url, "json": kwargs.get("json")})
        return _Response(status_code=500, text="wrong endpoint")

    monkeypatch.setattr(local_gpt_sovits.requests, "post", _post)

    with pytest.raises(RuntimeError, match="local_tts_non_200:500"):
        list(
            local_gpt_sovits.stream_local_gpt_sovits(
                text="hello",
                request_id="r2",
                config={"tts": {"sovtts2": {"url": "http://127.0.0.1:9880"}}},
                logger=logging.getLogger("test"),
                local_provider="sovtts2",
            )
        )

    assert [c["url"] for c in calls] == ["http://127.0.0.1:9880/tts"]
    assert "text_lang" in calls[0]["json"]


def test_local_tts_empty_output_fails(monkeypatch):
    monkeypatch.setattr(
        local_gpt_sovits.requests,
        "post",
        lambda *a, **k: _Response(status_code=200, chunks=[]),  # noqa: ARG005
    )

    with pytest.raises(RuntimeError, match="local_tts_empty_output:api_py_root"):
        list(
            local_gpt_sovits.stream_local_gpt_sovits(
                text="hello",
                request_id="r3",
                config={"tts": {"sovtts1": {"url": "http://127.0.0.1:9880"}}},
                logger=logging.getLogger("test"),
                local_provider="sovtts1",
            )
        )
