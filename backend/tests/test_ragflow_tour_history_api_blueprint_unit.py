from __future__ import annotations

from flask import Flask

from backend.api.ragflow_tour_history import create_blueprint


class _RagflowService:
    def __init__(self):
        self.clear_calls: list[str] = []
        self.new_session_calls: list[str] = []
        self.default_chat_name = "exhibit_chat"
        self._cfg = {"api_key": ""}

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
    def __init__(self):
        self.ragflow_service = _RagflowService()
        self.logger = _Logger()
        self.history_store = _HistoryStore()
        self.tour_planner = _TourPlanner()
        self.ragflow_default_chat_name = ""
        self.session = None


def _app():
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps()))
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
