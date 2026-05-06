from __future__ import annotations

from flask import Flask

from backend.api.ops import create_blueprint


class _OpsStore:
    def audit(self, **kwargs):  # noqa: ANN003
        return None


class _EventStore:
    def emit(self, **kwargs):  # noqa: ANN003
        return None


class _MissingStoreDeps:
    def __init__(self):
        self.ops_store = _OpsStore()
        self.event_store = _EventStore()


class _FailingQaAudioCacheStore:
    def list_pairs(self, **kwargs):  # noqa: ANN003
        raise RuntimeError("list failed")

    def delete_pair_hard(self, **kwargs):  # noqa: ANN003
        raise RuntimeError("delete failed")

    def cleanup_invalid_audio_pairs(self):
        raise RuntimeError("cleanup failed")


class _FailingStoreDeps(_MissingStoreDeps):
    def __init__(self):
        super().__init__()
        self.qa_audio_cache_store = _FailingQaAudioCacheStore()


def _app(deps) -> Flask:
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app


def _allow_open_ops(monkeypatch):
    monkeypatch.delenv("RAGINT_OPS_TOKEN", raising=False)
    monkeypatch.delenv("RAGINT_OPS_ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("RAGINT_OPS_VIEW_TOKEN", raising=False)
    monkeypatch.setenv("RAGINT_OPS_OPEN_ACCESS", "1")


def test_ops_qa_audio_pairs_returns_500_when_store_dependency_is_missing(monkeypatch):
    _allow_open_ops(monkeypatch)
    c = _app(_MissingStoreDeps()).test_client()

    resp = c.get("/api/ops/qa_audio_pairs")

    assert resp.status_code == 500


def test_ops_qa_audio_pairs_returns_500_when_list_store_raises(monkeypatch):
    _allow_open_ops(monkeypatch)
    c = _app(_FailingStoreDeps()).test_client()

    resp = c.get("/api/ops/qa_audio_pairs")

    assert resp.status_code == 500


def test_ops_qa_audio_pair_delete_returns_500_when_store_raises(monkeypatch):
    _allow_open_ops(monkeypatch)
    c = _app(_FailingStoreDeps()).test_client()

    resp = c.delete("/api/ops/qa_audio_pairs/1")

    assert resp.status_code == 500


def test_ops_qa_audio_pair_cleanup_returns_500_when_store_raises(monkeypatch):
    _allow_open_ops(monkeypatch)
    c = _app(_FailingStoreDeps()).test_client()

    resp = c.post("/api/ops/qa_audio_pairs/cleanup_invalid_audio")

    assert resp.status_code == 500
