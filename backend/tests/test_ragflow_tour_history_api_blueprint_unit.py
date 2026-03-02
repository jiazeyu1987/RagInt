from __future__ import annotations

from flask import Flask

from backend.api.ragflow_tour_history import create_blueprint


class _RagflowService:
    def __init__(self):
        self.clear_calls: list[str] = []
        self.new_session_calls: list[str] = []

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


def _app():
    app = Flask(__name__)
    app.register_blueprint(create_blueprint(_Deps()))
    return app


def test_ragflow_clear_chat_sessions_route():
    client = _app().test_client()
    resp = client.post("/api/ragflow/chats/clear_sessions", json={"chat_name": "展厅聊天"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["deleted"] == 3
    assert data["chat_name"] == "展厅聊天"


def test_ragflow_create_chat_session_route():
    client = _app().test_client()
    resp = client.post("/api/ragflow/chats/new_session", json={"chat_name": "展厅聊天"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["chat_name"] == "展厅聊天"
    assert data["session_id"] == "s_new"
