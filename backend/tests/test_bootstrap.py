from __future__ import annotations

import builtins
from types import SimpleNamespace

import pytest

import backend.bootstrap as bootstrap
from backend.services.ragflow_service import RagflowInitError


class _Logger:
    def __init__(self):
        self.errors: list[tuple[str, tuple, dict]] = []
        self.warnings: list[tuple[str, tuple, dict]] = []

    def error(self, msg, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        self.errors.append((str(msg), args, dict(kwargs)))

    def warning(self, msg, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        self.warnings.append((str(msg), args, dict(kwargs)))


def test_init_ragflow_logs_prerequisite_failure_without_stacktrace():
    class _RagflowService:
        default_chat_name = ""

        def init(self):
            raise RagflowInitError(
                "ragflow_base_url_unreachable",
                "RAGFlow初始化失败: 无法连接 http://127.0.0.1:9380。",
            )

    deps = SimpleNamespace(
        ragflow_service=_RagflowService(),
        ragflow_chat_manager=None,
        session=object(),
    )
    logger = _Logger()

    ok = bootstrap.init_ragflow(deps=deps, logger=logger)

    assert ok is False
    assert deps.session is None
    assert len(logger.errors) == 1
    msg, args, kwargs = logger.errors[0]
    assert msg == "%s"
    assert len(args) == 1
    assert "无法连接 http://127.0.0.1:9380" in str(args[0])
    assert kwargs == {}


def test_register_voicekit_fails_fast_when_dependency_missing(monkeypatch):
    real_import = builtins.__import__

    def _import(name, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        if str(name).startswith("asr_voicekit"):
            raise ModuleNotFoundError("No module named 'asr_voicekit'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _import)

    with pytest.raises(RuntimeError, match="VoiceKit backend package is not installed"):
        bootstrap.register_voicekit(app=object(), deps=SimpleNamespace(), logger=_Logger())
