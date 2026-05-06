from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.services.ragflow_agent_service import RagflowAgentService


class _Logger:
    def info(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def warning(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def error(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


class _StreamResponse:
    status_code = 200
    headers = {"content-type": "text/event-stream"}

    def __init__(self, lines):
        self._lines = lines
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):  # noqa: ANN001
        return False

    def raise_for_status(self):
        return None

    def iter_lines(self, *args, **kwargs):  # noqa: ANN002, ANN003
        yield from self._lines

    def close(self):
        self.closed = True


def _service_with_session(lines):
    svc = RagflowAgentService(
        Path("dummy.json"),
        logger=_Logger(),
        config_loader=lambda force=False: {"api_key": "valid_key", "base_url": "http://ragflow.example"},
    )
    svc._agent_sessions["agent_1"] = "session_1"  # noqa: SLF001
    return svc, _StreamResponse(lines)


def test_load_config_raises_when_loader_returns_non_object_config():
    svc = RagflowAgentService(Path("dummy.json"), logger=_Logger(), config_loader=lambda force=False: [])

    with pytest.raises(RuntimeError, match="ragflow_config_unexpected_shape"):
        svc.load_config()


def test_load_config_raises_when_file_contains_non_object_config(tmp_path):
    config_path = tmp_path / "ragflow_config.json"
    config_path.write_text(json.dumps([]), encoding="utf-8")
    svc = RagflowAgentService(config_path, logger=_Logger())

    with pytest.raises(RuntimeError, match="ragflow_config_unexpected_shape"):
        svc.load_config(force=True)


def test_stream_completion_raises_when_sse_json_is_damaged(monkeypatch):
    svc, response = _service_with_session([b"data: {not-json}"])
    monkeypatch.setattr("backend.services.ragflow_agent_service.requests.post", lambda *args, **kwargs: response)

    with pytest.raises(RuntimeError, match="ragflow_agent_completion_invalid_json"):
        list(svc.stream_completion_text("agent_1", "hello", "req_1"))


def test_stream_completion_yields_answer_deltas_and_accepts_terminal_marker(monkeypatch):
    svc, response = _service_with_session(
        [
            b'data: {"data": {"answer": "hel"}}',
            b'data: {"data": {"answer": "hello"}}',
            b'data: {"data": true}',
        ]
    )
    monkeypatch.setattr("backend.services.ragflow_agent_service.requests.post", lambda *args, **kwargs: response)

    assert list(svc.stream_completion_text("agent_1", "hello", "req_1")) == ["hel", "lo"]


def test_stream_completion_raises_when_agent_completion_shape_is_unexpected(monkeypatch):
    svc, response = _service_with_session([b'data: {"data": {"not_answer": "ignored"}}'])
    monkeypatch.setattr("backend.services.ragflow_agent_service.requests.post", lambda *args, **kwargs: response)

    with pytest.raises(RuntimeError, match="ragflow_agent_completion_unexpected_response"):
        list(svc.stream_completion_text("agent_1", "hello", "req_1"))
