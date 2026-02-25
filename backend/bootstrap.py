from __future__ import annotations

import os
from pathlib import Path

from flask import Flask

from backend.app_deps import AppDeps
from backend.config import RagflowAppConfig
from backend.config.env import env_bool, env_float, env_int


def resolve_config_path(*, repo_root: Path) -> Path:
    default_cfg = repo_root / "ragflow_demo" / "ragflow_config.json"
    return Path(os.environ.get("RAGINT_CONFIG_PATH") or default_cfg).resolve()


def _env_str(name: str, default: str = "") -> str:
    return str(os.environ.get(name) or default).strip()


def _env_path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name) or default).resolve()


def _build_ragflow(*, config_path: Path, logger):
    from backend.services.ragflow_agent_service import RagflowAgentService
    from backend.services.ragflow_service import RagflowService

    ragflow_service = RagflowService(config_path, logger=logger)
    ragflow_agent_service = RagflowAgentService(config_path, logger=logger)
    return ragflow_service, ragflow_agent_service


def _build_state_backend():
    from backend.infra.event_store import EventStore, RedisEventStore

    return RedisEventStore() if _env_str("RAGINT_STATE_BACKEND").lower() == "redis" else EventStore()


def _build_stores(*, data_dir: Path, logger):
    from backend.services.breakpoint_store import BreakpointStore
    from backend.services.history_store import HistoryStore
    from backend.services.ops_store import OpsStore
    from backend.services.qa_audio_cache_store import QaAudioCacheStore
    from backend.services.recording_store import RecordingStore
    from backend.services.selling_points_store import SellingPointsStore
    from backend.services.tour_control_store import TourControlStore

    history_store = HistoryStore(data_dir / "qa_history.db", logger=logger)
    qa_audio_cache_store = QaAudioCacheStore(
        root_dir=data_dir / "qa_audio_cache",
        db_path=_env_path("RAGINT_QA_AUDIO_CACHE_DB_PATH", data_dir / "qa_audio_cache.db"),
        logger=logger,
    )
    breakpoint_store = BreakpointStore(_env_path("RAGINT_BREAKPOINT_DB_PATH", data_dir / "breakpoints.db"), logger=logger)
    recording_store = RecordingStore(data_dir / "recordings", logger=logger)
    tour_control_store = TourControlStore(_env_path("RAGINT_TOUR_CONTROL_DB_PATH", data_dir / "tour_control.db"), logger=logger)
    selling_points_store = SellingPointsStore(
        _env_path("RAGINT_SELLING_POINTS_DB_PATH", data_dir / "selling_points.db"), logger=logger
    )
    ops_store = OpsStore(_env_path("RAGINT_OPS_DB_PATH", data_dir / "ops.db"), logger=logger)
    return history_store, qa_audio_cache_store, breakpoint_store, recording_store, tour_control_store, selling_points_store, ops_store


def _build_services(*, logger):
    from backend.infra.ask_timings import AskTimings
    from backend.infra.cancellation import CancellationRegistry
    from backend.services.intent_service import IntentService
    from backend.services.tour_command_service import TourCommandService
    from backend.services.tour_planner import TourPlanner
    from backend.services.tts_service import TTSSvc

    tts_service = TTSSvc(logger=logger)
    intent_service = IntentService()
    tour_planner = TourPlanner()
    tour_command_service = TourCommandService()
    request_registry = CancellationRegistry()
    ask_timings = AskTimings()
    return tts_service, intent_service, tour_planner, tour_command_service, request_registry, ask_timings


def build_deps(*, base_dir: Path, config_path: Path, logger) -> AppDeps:
    """
    Dependency composition entrypoint.

    Keep this function readable by delegating construction to small builders:
    - ragflow
    - stores
    - services
    - state backend (redis/memory)
    """

    data_dir = base_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    ragflow_service, ragflow_agent_service = _build_ragflow(config_path=config_path, logger=logger)
    (
        history_store,
        qa_audio_cache_store,
        breakpoint_store,
        recording_store,
        tour_control_store,
        selling_points_store,
        ops_store,
    ) = _build_stores(
        data_dir=data_dir, logger=logger
    )
    tts_service, intent_service, tour_planner, tour_command_service, request_registry, ask_timings = _build_services(
        logger=logger
    )
    from backend.services.qa_audio_matcher import QaAudioMatcher

    qa_audio_matcher = QaAudioMatcher(
        store=qa_audio_cache_store,
        ragflow_service=ragflow_service,
        tts_service=tts_service,
        logger=logger,
    )
    event_store = _build_state_backend()

    return AppDeps(
        base_dir=base_dir,
        logger=logger,
        ragflow_service=ragflow_service,
        ragflow_agent_service=ragflow_agent_service,
        history_store=history_store,
        tts_service=tts_service,
        intent_service=intent_service,
        tour_planner=tour_planner,
        request_registry=request_registry,
        event_store=event_store,
        recording_store=recording_store,
        ask_timings=ask_timings,
        breakpoint_store=breakpoint_store,
        tour_control_store=tour_control_store,
        tour_command_service=tour_command_service,
        selling_points_store=selling_points_store,
        ops_store=ops_store,
        qa_audio_cache_store=qa_audio_cache_store,
        qa_audio_matcher=qa_audio_matcher,
    )


def init_ragflow(*, deps: AppDeps, logger) -> bool:
    try:
        ok = deps.ragflow_service.init()
        deps.ragflow_default_chat_name = str(deps.ragflow_service.default_chat_name or "").strip()
        deps.session = deps.ragflow_service.get_session(deps.ragflow_default_chat_name) if ok else None
        return bool(ok)
    except Exception as e:
        logger.error(f"RAGFlow初始化失败: {e}", exc_info=True)
        return False


def register_blueprints(*, app: Flask, deps: AppDeps) -> None:
    from backend.api.breakpoint import create_blueprint as create_breakpoint_blueprint
    from backend.api.offline import create_blueprint as create_offline_blueprint
    from backend.api.ops import create_blueprint as create_ops_blueprint
    from backend.api.qa_audio_cache import create_blueprint as create_qa_audio_cache_blueprint
    from backend.api.ragflow_tour_history import create_blueprint as create_ragflow_tour_history_blueprint
    from backend.api.recordings import create_blueprint as create_recordings_blueprint
    from backend.api.selling_points import create_blueprint as create_selling_points_blueprint
    from backend.api.speech import create_blueprint as create_speech_blueprint
    from backend.api.system import create_blueprint as create_system_blueprint
    from backend.api.tts import create_blueprint as create_tts_blueprint
    from backend.api.tour_command import create_blueprint as create_tour_command_blueprint
    from backend.api.tour_control import create_blueprint as create_tour_control_blueprint

    app.register_blueprint(create_ragflow_tour_history_blueprint(deps))
    app.register_blueprint(create_offline_blueprint(deps))
    app.register_blueprint(create_system_blueprint(deps))
    app.register_blueprint(create_breakpoint_blueprint(deps))
    app.register_blueprint(create_tour_control_blueprint(deps))
    app.register_blueprint(create_tour_command_blueprint(deps))
    app.register_blueprint(create_selling_points_blueprint(deps))
    app.register_blueprint(create_ops_blueprint(deps))
    app.register_blueprint(create_qa_audio_cache_blueprint(deps))
    app.register_blueprint(create_speech_blueprint(deps))
    app.register_blueprint(create_recordings_blueprint(deps))
    app.register_blueprint(create_tts_blueprint(deps))


def register_voicekit(*, app: Flask, deps: AppDeps, logger) -> None:
    """
    RagInt ASR is fully implemented via VoiceKit.
    Required dependency: `pip install asr-voicekit`.
    """

    try:
        from asr_voicekit import register_voicekit
        from asr_voicekit.deps import VoiceKitDeps
        from asr_voicekit.providers.dashscope_provider import DashScopeProvider
        from asr_voicekit.wake_window import WakeWindowService
    except Exception as e:
        raise RuntimeError(
            "VoiceKit backend package is required but not installed. "
            "Install it with: pip install asr-voicekit (or install the built wheel). "
            f"Original error: {e}"
        ) from e

    app_cfg = {}
    try:
        app_cfg = deps.ragflow_service.load_config() or {}
    except Exception:
        app_cfg = {}

    cfg = RagflowAppConfig.from_any(app_cfg if isinstance(app_cfg, dict) else {})
    api_key = cfg.dashscope_api_key()
    model = cfg.asr_dashscope.model
    ws_url = cfg.asr_dashscope.ws_url

    voicekit_cfg = {
        "asr": {"dashscope": {"api_key": api_key, "model": model, "ws_url": ws_url}},
        "wake": {
            "active_ms": max(500, env_int("RAGINT_WAKE_ACTIVE_MS", 8000)),
            "max_pos_default": max(0, env_int("RAGINT_WAKE_CONTAINS_MAX_POS", 2)),
            "cooldown_ms_default": max(0, env_int("RAGINT_WAKE_COOLDOWN_MS", 0)),
            "store": "memory",
            "redis_url": "",
        },
        "asr_final": {
            "wait_s": max(0.0, min(10.0, env_float("RAGINT_ASR_FINAL_WAIT_S", 1.2))),
            "force_on_stop": env_bool("RAGINT_ASR_FORCE_FINAL_ON_STOP", True),
        },
        "auth": {"require_token": False, "secret": "", "token_ttl_s": 3600},
    }

    vk_deps = VoiceKitDeps(
        provider=DashScopeProvider(cfg=voicekit_cfg, logger=logger),
        logger=logger,
        wake_word_service=WakeWindowService(),
        config=voicekit_cfg,
    )
    app.config["voicekit_deps"] = vk_deps
    register_voicekit(app, vk_deps, url_prefix="/voicekit")

    logger.info("VoiceKit registered: /voicekit/ws/asr")
