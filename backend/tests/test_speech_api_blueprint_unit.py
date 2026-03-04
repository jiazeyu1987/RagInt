from __future__ import annotations

from flask import Flask

from backend.api.speech import create_blueprint


class _RagflowService:
    def __init__(self, raw_output: str = '{"text":"给我讲讲指引导丝"}', should_raise: bool = False):
        self.raw_output = raw_output
        self.should_raise = should_raise
        self.calls: list[dict] = []

    def ask_chat(self, **kwargs):
        self.calls.append(dict(kwargs))
        if self.should_raise:
            raise RuntimeError("ragflow_chat_not_found:语音模型")
        return self.raw_output


class _Logger:
    def info(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def warning(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def error(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


class _Deps:
    def __init__(self, ragflow_service):
        self.ragflow_service = ragflow_service
        self.logger = _Logger()


def _app(ragflow_service):
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps(ragflow_service)))
    return app


def test_api_asr_filter_returns_corrected_text():
    ragflow_service = _RagflowService()
    client = _app(ragflow_service).test_client()

    resp = client.post(
        "/api/asr/filter",
        json={
            "text": "给我讲讲指引导致",
            "chat_name": "语音模型",
            "prompt": "输入是{ASR的语音输入}\n领域片段{领域片段}",
            "domain_terms": ["指引导丝", "指引导管"],
        },
    )

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["text"] == "给我讲讲指引导丝"
    assert data["filtered"] is True
    assert data["used_fallback"] is False
    assert ragflow_service.calls[0]["chat_name"] == "语音模型"
    assert "给我讲讲指引导致" in ragflow_service.calls[0]["question"]
    assert "指引导丝,指引导管" in ragflow_service.calls[0]["question"]


def test_api_asr_filter_falls_back_to_original_text_on_error():
    ragflow_service = _RagflowService(should_raise=True)
    client = _app(ragflow_service).test_client()

    resp = client.post(
        "/api/asr/filter",
        json={
            "text": "给我讲讲指引导致",
            "chat_name": "语音模型",
            "prompt": "输入是{ASR的语音输入}",
        },
    )

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["text"] == "给我讲讲指引导致"
    assert data["filtered"] is False
    assert data["used_fallback"] is True
    assert "ragflow_chat_not_found" in data["error"]
