from __future__ import annotations

from flask import Flask

from backend.api.speech import create_blueprint
from backend.services.asr_text_filter import parse_asr_filter_response


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
        self.ragflow_chat_manager = ragflow_service
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
    assert "used_fallback" not in data
    assert ragflow_service.calls[0]["chat_name"] == "语音模型"
    assert "给我讲讲指引导致" in ragflow_service.calls[0]["question"]
    assert "指引导丝,指引导管" in ragflow_service.calls[0]["question"]


def test_api_asr_filter_fails_when_ragflow_filter_errors():
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

    assert resp.status_code == 502
    data = resp.get_json()
    assert data["ok"] is False
    assert data["error"] == "asr_filter_failed"
    assert "ragflow_chat_not_found" in data["detail"]


def test_parse_asr_filter_response_rejects_invalid_model_output():
    try:
        parse_asr_filter_response(raw_text="not-json")
    except ValueError as exc:
        assert "invalid" in str(exc)
    else:
        raise AssertionError("invalid ASR filter output must fail instead of returning fallback text")


def test_api_asr_filter_rejects_invalid_model_output_without_fallback_text():
    original_text = "鍘熷鏂囨湰"
    ragflow_service = _RagflowService(raw_output="not-json")
    client = _app(ragflow_service).test_client()

    resp = client.post(
        "/api/asr/filter",
        json={
            "text": original_text,
            "chat_name": "璇煶妯″瀷",
            "prompt": "杈撳叆鏄瘂ASR鐨勮闊宠緭鍏",
        },
    )

    assert resp.status_code == 502
    data = resp.get_json()
    assert data["ok"] is False
    assert data["error"] == "asr_filter_invalid_response"
    assert data.get("text") != original_text
