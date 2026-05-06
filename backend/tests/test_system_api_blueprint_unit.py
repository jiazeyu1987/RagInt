from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

import pytest
from flask import Flask

from backend.api.system import create_blueprint


class _EventStore:
    def __init__(self):
        self.emitted: list[dict] = []
        self.list_recent_calls: list[tuple] = []
        self.list_events_calls: list[tuple] = []
        self.recent_items: list[dict] = [
            {"request_id": "r_any", "name": "evt_recent_1", "ts_ms": 100},
            {"request_id": "r_any", "name": "evt_recent_2", "ts_ms": 200},
        ]
        self.by_request: dict[str, list[dict]] = {
            "r1": [
                {"request_id": "r1", "name": "ask_received", "fields": {"stop_id": "stop_1", "stop_name": "Stop A", "action_type": "start"}},
                {"request_id": "r1", "name": "evt_r1_2", "ts_ms": 300},
            ]
        }

    def emit(self, **kwargs):  # noqa: ANN003
        self.emitted.append(dict(kwargs))

    def list_recent(self, *, limit: int = 200, since_ms: int | None = None):
        self.list_recent_calls.append((int(limit), since_ms))
        items = list(self.recent_items)
        if since_ms is not None:
            items = [it for it in items if int(it.get("ts_ms") or 0) >= int(since_ms)]
        return items[: int(limit)]

    def list_events(self, *, request_id: str, limit: int = 200, since_ms: int | None = None):
        self.list_events_calls.append((str(request_id), int(limit), since_ms))
        items = list(self.by_request.get(str(request_id), []))
        if since_ms is not None:
            items = [it for it in items if int(it.get("ts_ms") or since_ms) >= int(since_ms)]
        return items[: int(limit)]

    def last_error(self, *, request_id: str):
        return {"error": "boom", "request_id": "r1"} if str(request_id) == "r1" else None


class _FailingEventStore(_EventStore):
    def emit(self, **kwargs):  # noqa: ANN003
        raise RuntimeError("event_store_down")


class _AskTimings:
    def __init__(self):
        self.values = {"r1": {"t_submit": 1.0, "t_first_tts_segment": 1.2}}
        self.set_calls: list[tuple] = []

    def get(self, request_id: str):
        return dict(self.values.get(str(request_id), {}))

    def set(self, request_id: str, **kwargs):  # noqa: ANN003
        rid = str(request_id)
        cur = dict(self.values.get(rid, {}))
        cur.update(kwargs or {})
        self.values[rid] = cur
        self.set_calls.append((rid, dict(kwargs or {})))


class _RequestRegistry:
    def __init__(self):
        self.info_map = {"r1": {"request_id": "r1", "canceled_at": None, "cancel_reason": None}}

    def get_info(self, request_id: str):
        return dict(self.info_map.get(str(request_id), {}))

    def is_cancelled(self, request_id: str):
        return str(request_id) == "r_cancelled"


class _TtsService:
    def tts_state_get(self, request_id: str):
        return {"request_id": str(request_id), "queue_size": 0}


class _RagflowService:
    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg if isinstance(cfg, dict) else {"asr": {"dashscope": {"api_key": "k1"}}}
        self.calls: list[bool] = []

    def load_config(self, *, force: bool = False):
        self.calls.append(bool(force))
        return dict(self.cfg)


class _Deps:
    def __init__(self, *, base_dir: Path, session):
        self.base_dir = str(base_dir)
        self.event_store = _EventStore()
        self.ask_timings = _AskTimings()
        self.request_registry = _RequestRegistry()
        self.tts_service = _TtsService()
        self.ragflow_service = _RagflowService()
        self.session = session


@pytest.fixture()
def work_dir():
    root = (Path(__file__).resolve().parent / ".tmp_workdirs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    base = root / f"system_api_test_{uuid.uuid4().hex}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)


def _build_app(work_dir: Path, *, session=object()) -> tuple[Flask, _Deps]:
    deps = _Deps(base_dir=work_dir, session=session)
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))
    return app, deps


def test_openapi_fails_fast_when_missing(work_dir: Path):
    app, _deps = _build_app(work_dir)
    c = app.test_client()
    resp = c.get("/api/openapi.json")
    assert resp.status_code == 500
    body = resp.get_json()
    assert body["ok"] is False
    assert body["error"] == "openapi_spec_required"


def test_openapi_reads_local_file(work_dir: Path):
    payload = {"openapi": "3.1.0", "info": {"title": "Custom API", "version": "1.0.0"}, "paths": {"/x": {}}}
    (work_dir / "openapi.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    app, _deps = _build_app(work_dir)
    c = app.test_client()
    resp = c.get("/api/openapi.json")
    assert resp.status_code == 200
    assert resp.get_json() == payload


def test_events_json_and_ndjson_formats(work_dir: Path):
    app, deps = _build_app(work_dir)
    c = app.test_client()

    recent_resp = c.get("/api/events?limit=1")
    assert recent_resp.status_code == 200
    recent_body = recent_resp.get_json()
    assert recent_body["request_id"] is None
    assert len(recent_body["items"]) == 1
    assert recent_body["last_error"] is None
    assert deps.event_store.list_recent_calls[-1] == (1, None)

    by_req_resp = c.get("/api/events?request_id=r1&limit=5&since_ms=100")
    assert by_req_resp.status_code == 200
    by_req_body = by_req_resp.get_json()
    assert by_req_body["request_id"] == "r1"
    assert by_req_body["last_error"]["error"] == "boom"
    assert deps.event_store.list_events_calls[-1] == ("r1", 5, 100)

    ndjson_resp = c.get("/api/events?request_id=r1&format=ndjson&limit=2")
    assert ndjson_resp.status_code == 200
    assert "application/x-ndjson" in str(ndjson_resp.headers.get("content-type", "")).lower()
    lines = [x for x in str(ndjson_resp.data.decode("utf-8")).splitlines() if x.strip()]
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["name"] == "ask_received"


def test_events_rejects_invalid_explicit_query_values(work_dir: Path):
    app, _deps = _build_app(work_dir)
    c = app.test_client()

    bad_limit = c.get("/api/events?limit=bad")
    assert bad_limit.status_code == 400
    assert bad_limit.get_json()["error"] == "invalid_limit"

    bad_since = c.get("/api/events?since_ms=bad")
    assert bad_since.status_code == 400
    assert bad_since.get_json()["error"] == "invalid_since_ms"


def test_client_events_validate_and_ingest(work_dir: Path):
    app, deps = _build_app(work_dir)
    c = app.test_client()

    bad = c.post("/api/client_events", json={"name": "play_end"})
    assert bad.status_code == 400
    bad_body = bad.get_json()
    assert bad_body["ok"] is False
    assert bad_body["error"] == "request_id_and_name_required"

    ok = c.post(
        "/api/client_events",
        headers={"X-Request-ID": "r_new", "X-Client-ID": "c9"},
        json={"name": "play_end", "fields": {"source": "ui"}},
    )
    assert ok.status_code == 200
    assert ok.get_json()["ok"] is True
    assert deps.event_store.emitted[-1]["request_id"] == "r_new"
    assert deps.event_store.emitted[-1]["source"] == "ui"
    assert deps.ask_timings.set_calls[-1][0] == "r_new"


def test_client_events_returns_error_when_ingest_write_fails(work_dir: Path):
    app, deps = _build_app(work_dir)
    deps.event_store = _FailingEventStore()
    c = app.test_client()

    resp = c.post(
        "/api/client_events",
        headers={"X-Request-ID": "r_new", "X-Client-ID": "c9"},
        json={"name": "play_end", "fields": {"source": "ui"}},
    )

    assert resp.status_code == 500
    body = resp.get_json()
    assert body["ok"] is False
    assert body["error"] == "client_event_ingest_failed"


def test_status_and_health_routes(work_dir: Path):
    app, deps = _build_app(work_dir, session=object())
    c = app.test_client()

    bad = c.get("/api/status")
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "request_id_required"

    status = c.get("/api/status?request_id=r1")
    assert status.status_code == 200
    status_body = status.get_json()
    assert status_body["request_id"] == "r1"
    assert status_body["context"]["stop_id"] == "stop_1"
    assert status_body["derived_ms"]["submit_to_first_segment_ms"] == 200.0
    assert status_body["tts_state"]["queue_size"] == 0
    assert status_body["last_error"]["error"] == "boom"

    health = c.get("/health")
    assert health.status_code == 200
    health_body = health.get_json()
    assert health_body["asr_provider"] == "voicekit"
    assert health_body["asr_api_key_configured"] is True
    assert health_body["ragflow_connected"] is True

    deps.session = None
    health2 = c.get("/health")
    assert health2.status_code == 200
    assert health2.get_json()["ragflow_connected"] is False
