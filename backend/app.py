#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import logging
import os
import sys
from pathlib import Path

from flask import Flask
from flask_cors import CORS

# Allow `python backend/app.py` when executed from inside `backend/`.
# When run as a script, Python sets sys.path[0] to the script's directory
# (i.e. `<repo>/backend`), which breaks absolute imports like `import backend.*`.
if __package__ is None and __name__ == "__main__":
    repo_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(repo_root))

from backend.app_deps import AppDeps
from backend.infra.ask_timings import AskTimings

from backend.api.offline import create_blueprint as create_offline_blueprint
from backend.api.ragflow_tour_history import create_blueprint as create_ragflow_tour_history_blueprint
from backend.api.breakpoint import create_blueprint as create_breakpoint_blueprint
from backend.api.recordings import create_blueprint as create_recordings_blueprint
from backend.api.speech import create_blueprint as create_speech_blueprint
from backend.api.system import create_blueprint as create_system_blueprint
from backend.api.tts import create_blueprint as create_tts_blueprint
from backend.api.wake_word import create_blueprint as create_wake_word_blueprint
from backend.api.tour_control import create_blueprint as create_tour_control_blueprint
from backend.api.tour_command import create_blueprint as create_tour_command_blueprint
from backend.api.selling_points import create_blueprint as create_selling_points_blueprint
from backend.api.ops import create_blueprint as create_ops_blueprint

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class _DashscopeByeNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        if "opcode=8" in msg and "Bye" in msg and ("goodbye" in msg.lower() or "websocket closed" in msg.lower()):
            return False
        if "Websocket connected" in msg:
            return False
        if "SpeechSynthesizerObjectPool" in msg and "renew synthesizer after" in msg:
            return False
        return True


class _AccessNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        if "GET /api/status" in msg:
            return False
        if "GET /api/events" in msg:
            return False
        return True


def _install_log_filters() -> None:
    with contextlib.suppress(Exception):
        access_filter = _AccessNoiseFilter()
        bye_filter = _DashscopeByeNoiseFilter()

        root = logging.getLogger()
        root.addFilter(access_filter)
        root.addFilter(bye_filter)
        for h in list(getattr(root, "handlers", []) or []):
            h.addFilter(access_filter)
            h.addFilter(bye_filter)

        for name in ("werkzeug", "werkzeug.serving"):
            lg = logging.getLogger(name)
            lg.addFilter(access_filter)
            for h in list(getattr(lg, "handlers", []) or []):
                h.addFilter(access_filter)


for _name in (
    "dashscope.audio.tts_v2.speech_synthesizer",
    "dashscope",
    "websocket",
    "websocket._logging",
    "websocket._app",
):
    with contextlib.suppress(Exception):
        logging.getLogger(_name).addFilter(_DashscopeByeNoiseFilter())
        logging.getLogger(_name).setLevel(logging.WARNING)


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return bool(default)
    v = str(value).strip().lower()
    if v in ("1", "true", "yes", "y", "on"):
        return True
    if v in ("0", "false", "no", "n", "off"):
        return False
    return bool(default)


def _parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    items = []
    for part in str(raw).split(","):
        o = part.strip()
        if o:
            items.append(o)
    return items or ["http://localhost:3000", "http://127.0.0.1:3000"]


def create_app() -> Flask:
    _install_log_filters()

    with contextlib.suppress(Exception):
        from logging import NullHandler as _NullHandler  # type: ignore

        _ws_logger = logging.getLogger("websocket")
        for _h in list(_ws_logger.handlers):
            if not isinstance(_h, _NullHandler):
                _ws_logger.removeHandler(_h)

    from backend.infra.cancellation import CancellationRegistry
    from backend.infra.event_store import EventStore, RedisEventStore
    from backend.services.asr_service import ASRService
    from backend.services.breakpoint_store import BreakpointStore
    from backend.services.history_store import HistoryStore
    from backend.services.intent_service import IntentService
    from backend.services.ragflow_agent_service import RagflowAgentService
    from backend.services.ragflow_service import RagflowService
    from backend.services.recording_store import RecordingStore
    from backend.services.tour_planner import TourPlanner
    from backend.services.tts_service import TTSSvc
    from backend.services.wake_word_service import WakeWordService
    from backend.services.tour_control_store import TourControlStore
    from backend.services.tour_command_service import TourCommandService
    from backend.services.selling_points_store import SellingPointsStore
    from backend.services.ops_store import OpsStore

    app = Flask(__name__)

    repo_root = Path(__file__).resolve().parent.parent
    default_cfg = repo_root / "ragflow_demo" / "ragflow_config.json"
    config_path = Path(os.environ.get("RAGINT_CONFIG_PATH") or default_cfg).resolve()

    origins = _parse_cors_origins(os.environ.get("RAGINT_CORS_ORIGINS"))
    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": origins}},
        allow_headers=["Content-Type", "X-Client-ID", "X-Request-ID", "X-Recording-ID", "X-TTS-Provider", "X-TTS-Voice"],
    )

    ragflow_service = RagflowService(config_path, logger=logger)
    ragflow_agent_service = RagflowAgentService(config_path, logger=logger)
    history_store = HistoryStore(Path(__file__).parent / "data" / "qa_history.db", logger=logger)
    breakpoint_db_path = Path(os.environ.get("RAGINT_BREAKPOINT_DB_PATH") or (Path(__file__).parent / "data" / "breakpoints.db"))
    breakpoint_store = BreakpointStore(breakpoint_db_path, logger=logger)
    asr_service = ASRService(logger=logger)
    tts_service = TTSSvc(logger=logger)
    intent_service = IntentService()
    tour_planner = TourPlanner()
    request_registry = CancellationRegistry()
    if str(os.environ.get("RAGINT_STATE_BACKEND") or "").strip().lower() == "redis":
        event_store = RedisEventStore()
    else:
        event_store = EventStore()
    recording_store = RecordingStore(Path(__file__).parent / "data" / "recordings", logger=logger)
    ask_timings = AskTimings()
    wake_word_service = WakeWordService()
    tour_control_db_path = Path(os.environ.get("RAGINT_TOUR_CONTROL_DB_PATH") or (Path(__file__).parent / "data" / "tour_control.db"))
    tour_control_store = TourControlStore(tour_control_db_path, logger=logger)
    tour_command_service = TourCommandService()
    selling_points_db_path = Path(
        os.environ.get("RAGINT_SELLING_POINTS_DB_PATH") or (Path(__file__).parent / "data" / "selling_points.db")
    )
    selling_points_store = SellingPointsStore(selling_points_db_path, logger=logger)
    ops_db_path = Path(os.environ.get("RAGINT_OPS_DB_PATH") or (Path(__file__).parent / "data" / "ops.db"))
    ops_store = OpsStore(ops_db_path, logger=logger)

    deps = AppDeps(
        base_dir=Path(__file__).parent,
        logger=logger,
        ragflow_service=ragflow_service,
        ragflow_agent_service=ragflow_agent_service,
        history_store=history_store,
        asr_service=asr_service,
        tts_service=tts_service,
        intent_service=intent_service,
        tour_planner=tour_planner,
        request_registry=request_registry,
        event_store=event_store,
        recording_store=recording_store,
        ask_timings=ask_timings,
        breakpoint_store=breakpoint_store,
        wake_word_service=wake_word_service,
        tour_control_store=tour_control_store,
        tour_command_service=tour_command_service,
        selling_points_store=selling_points_store,
        ops_store=ops_store,
    )

    def _init_ragflow() -> bool:
        try:
            ok = ragflow_service.init()
            deps.ragflow_default_chat_name = str(ragflow_service.default_chat_name or "").strip()
            deps.session = ragflow_service.get_session(deps.ragflow_default_chat_name) if ok else None
            return bool(ok)
        except Exception as e:
            logger.error(f"RAGFlow初始化失败: {e}", exc_info=True)
            return False

    _init_ragflow()

    app.register_blueprint(create_ragflow_tour_history_blueprint(deps))
    app.register_blueprint(create_offline_blueprint(deps))
    app.register_blueprint(create_system_blueprint(deps))
    app.register_blueprint(create_breakpoint_blueprint(deps))
    app.register_blueprint(create_wake_word_blueprint(deps))
    app.register_blueprint(create_tour_control_blueprint(deps))
    app.register_blueprint(create_tour_command_blueprint(deps))
    app.register_blueprint(create_selling_points_blueprint(deps))
    app.register_blueprint(create_ops_blueprint(deps))
    app.register_blueprint(create_speech_blueprint(deps))
    app.register_blueprint(create_recordings_blueprint(deps))
    app.register_blueprint(create_tts_blueprint(deps))
    return app


def main() -> None:
    host = str(os.environ.get("RAGINT_HOST") or "0.0.0.0").strip() or "0.0.0.0"
    try:
        port = int(os.environ.get("RAGINT_PORT") or 8000)
    except Exception:
        port = 8000
    debug = _parse_bool(os.environ.get("RAGINT_DEBUG"), default=False)

    app = create_app()
    logger.info("启动语音问答后端服务")
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
