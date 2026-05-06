from __future__ import annotations

from flask import Flask

from backend.api.ragflow_tour_history import create_blueprint


class _RagflowService:
    def __init__(self, cfg: dict | None = None):
        self.clear_calls: list[str] = []
        self.new_session_calls: list[str] = []
        self.default_chat_name = "exhibit_chat"
        self._cfg = {"api_key": ""} if cfg is None else dict(cfg)

    def list_chats(self):
        return {"chats": [], "default": None}

    def list_agents(self):
        return {"agents": [], "default": None}

    def clear_chat_sessions(self, chat_name: str):
        self.clear_calls.append(str(chat_name))
        return {"ok": True, "deleted": 3, "chat_name": str(chat_name)}

    def create_new_session(self, chat_name: str):
        self.new_session_calls.append(str(chat_name))
        return {"ok": True, "chat_name": str(chat_name), "session_id": "s_new"}

    def load_config(self, force: bool = False):  # noqa: ARG002
        return dict(self._cfg)

    def save_config(self, cfg: dict):
        self._cfg = dict(cfg or {})
        return dict(self._cfg)

    def init(self):
        return bool(str(self._cfg.get("api_key") or "").strip())

    def get_session(self, chat_name: str):  # noqa: ARG002
        return {"id": "s1"}


class _RagflowChatManager:
    def __init__(self, service: _RagflowService):
        self._service = service
        self.default_session = None

    def list_chats(self):
        return self._service.list_chats()

    def list_agents(self):
        return self._service.list_agents()

    def clear_chat_sessions(self, chat_name: str):
        return self._service.clear_chat_sessions(chat_name)

    def create_new_session(self, chat_name: str):
        return self._service.create_new_session(chat_name)

    def resolve_session(self, *, agent_id: str, conversation_name: str):
        if str(agent_id or "").strip():
            return None
        return self._service.get_session(conversation_name)

    def set_default_session(self, session):
        self.default_session = session


class _Logger:
    def info(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def warning(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None

    def error(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


class _HistoryStore:
    def list_by_count(self, limit: int, desc: bool):  # noqa: ARG002
        return []

    def list_by_time(self, limit: int, desc: bool):  # noqa: ARG002
        return []


class _TourPlanner:
    def get_meta(self, cfg):  # noqa: ANN001
        return {"zones": [], "profiles": []}

    def make_plan(self, cfg, zone, profile, duration_s, stop_durations_override=None):  # noqa: ANN001, ARG002
        raise AssertionError("not used")

    def make_plan_from_stops(self, **kwargs):  # noqa: ANN003
        raise AssertionError("not used")


class _Deps:
    def __init__(self, cfg: dict | None = None):
        self.ragflow_service = _RagflowService(cfg)
        self.ragflow_chat_manager = _RagflowChatManager(self.ragflow_service)
        self.logger = _Logger()
        self.history_store = _HistoryStore()
        self.tour_planner = _TourPlanner()
        self.ragflow_default_chat_name = ""
        self.session = None


def _app(cfg: dict | None = None):
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps(cfg)))
    return app


def test_ragflow_clear_chat_sessions_route():
    client = _app().test_client()
    resp = client.post("/api/ragflow/chats/clear_sessions", json={"chat_name": "exhibit_chat"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["deleted"] == 3
    assert data["chat_name"] == "exhibit_chat"


def test_ragflow_create_chat_session_route():
    client = _app().test_client()
    resp = client.post("/api/ragflow/chats/new_session", json={"chat_name": "exhibit_chat"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["chat_name"] == "exhibit_chat"
    assert data["session_id"] == "s_new"


def test_ragflow_chats_route_returns_non_200_when_service_fails():
    class _FailingChatManager:
        def list_chats(self):
            raise RuntimeError("ragflow_not_initialized")

    deps = _Deps()
    deps.ragflow_chat_manager = _FailingChatManager()
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))

    resp = app.test_client().get("/api/ragflow/chats")

    assert resp.status_code == 500


def test_ragflow_agents_route_returns_non_200_when_service_fails():
    class _FailingChatManager:
        def list_agents(self):
            raise RuntimeError("ragflow_agents_fetch_failed")

    deps = _Deps()
    deps.ragflow_chat_manager = _FailingChatManager()
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))

    resp = app.test_client().get("/api/ragflow/agents")

    assert resp.status_code == 500


def test_ragflow_config_get_and_put_route():
    client = _app().test_client()

    r_get0 = client.get("/api/ragflow/config")
    assert r_get0.status_code == 200
    assert r_get0.get_json()["config"]["api_key"] == ""

    r_put = client.put("/api/ragflow/config", json={"api_key": "ragflow-key-1"})
    assert r_put.status_code == 200
    body = r_put.get_json()
    assert body["ok"] is True
    assert body["config"]["api_key"] == "ragflow-key-1"
    assert body["ragflow_connected"] is True

    r_get1 = client.get("/api/ragflow/config")
    assert r_get1.status_code == 200
    assert r_get1.get_json()["config"]["api_key"] == "ragflow-key-1"

    r_bad = client.put("/api/ragflow/config", json={})
    assert r_bad.status_code == 400


def test_ragflow_config_put_rejects_invalid_json_body():
    client = _app().test_client()

    resp = client.put("/api/ragflow/config", data="{", content_type="application/json")

    assert resp.status_code == 400
    assert resp.get_json() == {
        "ok": False,
        "error": "request_body_invalid",
        "detail": "request body must be valid JSON object",
    }


def test_ragflow_clear_chat_sessions_rejects_invalid_json_body():
    client = _app().test_client()

    resp = client.post("/api/ragflow/chats/clear_sessions", data="{", content_type="application/json")

    assert resp.status_code == 400
    assert resp.get_json() == {
        "ok": False,
        "error": "request_body_invalid",
        "detail": "request body must be valid JSON object",
    }


def test_ragflow_create_chat_session_rejects_non_object_json_body():
    client = _app().test_client()

    resp = client.post("/api/ragflow/chats/new_session", json=["exhibit_chat"])

    assert resp.status_code == 400
    assert resp.get_json() == {
        "ok": False,
        "error": "request_body_invalid",
        "detail": "request body must be valid JSON object",
    }


def test_tour_stops_returns_configured_stops_without_fallback():
    client = _app({"tour": {"stops": ["lobby", "demo"]}}).test_client()

    resp = client.get("/api/tour/stops")

    assert resp.status_code == 200
    assert resp.get_json() == {"stops": ["lobby", "demo"], "source": "ragflow_config.tour.stops"}


def test_tour_stops_fails_when_ragflow_config_missing_stops():
    client = _app({"api_key": "ragflow-key-1"}).test_client()

    resp = client.get("/api/tour/stops")

    assert resp.status_code == 500
    assert resp.get_json() == {
        "ok": False,
        "error": "tour_stops_required",
        "detail": "ragflow_config.tour.stops_required",
    }


def test_history_list_allows_real_empty_history():
    client = _app().test_client()

    resp = client.get("/api/history")

    assert resp.status_code == 200
    assert resp.get_json() == {"sort": "time", "items": []}


def test_history_list_rejects_empty_explicit_limit():
    client = _app().test_client()

    resp = client.get("/api/history?limit=")

    assert resp.status_code == 400
    assert resp.get_json() == {
        "ok": False,
        "error": "history_query_invalid",
        "detail": "history query limit must be an integer",
    }


def test_history_list_fails_when_history_store_returns_invalid_shape():
    class _InvalidHistoryStore:
        def list_by_time(self, limit: int, desc: bool):  # noqa: ARG002
            return None

    deps = _Deps()
    deps.history_store = _InvalidHistoryStore()
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))

    resp = app.test_client().get("/api/history")

    assert resp.status_code == 500
    assert resp.get_json() == {
        "ok": False,
        "error": "history_store_invalid_response",
        "detail": "history_store.list_by_time must return a list",
    }


def test_history_list_returns_500_when_history_store_raises():
    class _FailingHistoryStore:
        def list_by_time(self, limit: int, desc: bool):  # noqa: ARG002
            raise RuntimeError("history_store_unavailable")

    deps = _Deps()
    deps.history_store = _FailingHistoryStore()
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))

    resp = app.test_client().get("/api/history")

    assert resp.status_code == 500


def test_tour_templates_fails_when_config_store_returns_invalid_shape():
    class _InvalidConfigService(_RagflowService):
        def load_config(self, force: bool = False):  # noqa: ARG002
            return "invalid-config"

    deps = _Deps()
    deps.ragflow_service = _InvalidConfigService()
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(deps))

    resp = app.test_client().get("/api/tour/templates")

    assert resp.status_code == 500
    assert resp.get_json() == {
        "ok": False,
        "error": "ragflow_config_invalid",
        "detail": "ragflow_service.load_config must return a dict",
    }


def test_tour_plan_rejects_non_object_json_body():
    client = _app({"tour_planner": {"routes": {"": ["A"]}}}).test_client()

    resp = client.post("/api/tour/plan", json=["not", "an", "object"])

    assert resp.status_code == 400
    assert resp.get_json() == {
        "ok": False,
        "error": "request_body_invalid",
        "detail": "request body must be valid JSON object",
    }
