from __future__ import annotations

import copy

from flask import Blueprint, jsonify, request

from backend.config import RagflowAppConfig
from backend.api.ragflow_tour_history_utils import (
    RagflowTourHistoryContractError,
    build_stops_meta,
    build_tour_templates,
    load_ragflow_config_dict,
    normalize_stops,
    parse_history_query,
    parse_json_object_request,
    parse_tour_plan_request,
    require_history_items,
)


def create_blueprint(deps):
    bp = Blueprint("ragflow_tour_history_api", __name__)
    rag_chat_manager = getattr(deps, "ragflow_chat_manager", None) or getattr(deps, "ragflow_service", None)

    @bp.errorhandler(RagflowTourHistoryContractError)
    def handle_contract_error(exc):
        return jsonify({"ok": False, "error": exc.error, "detail": exc.detail}), exc.status_code

    @bp.route("/api/ragflow/chats", methods=["GET"])
    def ragflow_list_chats():
        return jsonify(rag_chat_manager.list_chats())

    @bp.route("/api/ragflow/chats/clear_sessions", methods=["POST"])
    def ragflow_clear_chat_sessions():
        data = parse_json_object_request(request)
        chat_name = str(data.get("chat_name") or "").strip()
        result = rag_chat_manager.clear_chat_sessions(chat_name)
        status = 200 if result.get("ok") else 500
        return jsonify(result), status

    @bp.route("/api/ragflow/chats/new_session", methods=["POST"])
    def ragflow_create_chat_session():
        data = parse_json_object_request(request)
        chat_name = str(data.get("chat_name") or "").strip()
        result = rag_chat_manager.create_new_session(chat_name)
        status = 200 if result.get("ok") else 500
        return jsonify(result), status

    @bp.route("/api/ragflow/agents", methods=["GET"])
    def ragflow_list_agents():
        res = rag_chat_manager.list_agents()
        deps.logger.info(f"ragflow_agents_list count={len(res.get('agents') or [])}")
        return jsonify(res)

    @bp.route("/api/ragflow/config", methods=["GET"])
    def ragflow_get_config():
        cfg = load_ragflow_config_dict(deps=deps)
        return jsonify(
            {
                "ok": True,
                "config": {
                    "api_key": str(cfg.get("api_key") or ""),
                },
            }
        )

    @bp.route("/api/ragflow/config", methods=["PUT"])
    def ragflow_set_config():
        data = parse_json_object_request(request)
        if "api_key" not in data:
            return jsonify({"ok": False, "error": "api_key_required"}), 400
        api_key = str(data.get("api_key") or "").strip()
        cfg = copy.deepcopy(load_ragflow_config_dict(deps=deps, force=True))
        cfg.pop("__meta", None)
        cfg["api_key"] = api_key
        deps.ragflow_service.save_config(cfg)
        connected = bool(deps.ragflow_service.init())
        deps.ragflow_default_chat_name = str(deps.ragflow_service.default_chat_name or "").strip()
        deps.session = rag_chat_manager.resolve_session(agent_id="", conversation_name=deps.ragflow_default_chat_name) if connected else None
        if hasattr(rag_chat_manager, "set_default_session"):
            rag_chat_manager.set_default_session(deps.session)
        return jsonify(
            {
                "ok": True,
                "config": {"api_key": api_key},
                "ragflow_connected": connected,
            }
        )

    @bp.route("/api/history", methods=["GET"])
    def api_history_list():
        q = parse_history_query(request)
        if q.sort_mode in ("count", "freq", "frequency"):
            items = deps.history_store.list_by_count(limit=q.limit, desc=q.desc)
            items = require_history_items(items, source="history_store.list_by_count")
            return jsonify({"sort": "count", "items": items})
        items = deps.history_store.list_by_time(limit=q.limit, desc=q.desc)
        items = require_history_items(items, source="history_store.list_by_time")
        return jsonify({"sort": "time", "items": items})

    @bp.route("/api/tour/stops", methods=["GET"])
    def api_tour_stops():
        cfg = load_ragflow_config_dict(deps=deps)
        app_cfg = RagflowAppConfig.from_any(cfg)
        stops = normalize_stops(app_cfg.tour.stops or [])
        if not stops:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "tour_stops_required",
                        "detail": "ragflow_config.tour.stops_required",
                    }
                ),
                500,
            )
        return jsonify({"stops": stops, "source": "ragflow_config.tour.stops"})

    @bp.route("/api/tour/meta", methods=["GET"])
    def api_tour_meta():
        cfg = load_ragflow_config_dict(deps=deps)
        meta = deps.tour_planner.get_meta(cfg)
        return jsonify(meta)

    @bp.route("/api/tour/templates", methods=["GET"])
    def api_tour_templates():
        cfg = load_ragflow_config_dict(deps=deps)
        app_cfg = RagflowAppConfig.from_any(cfg)
        templates = build_tour_templates(app_cfg=app_cfg, raw_cfg=cfg)
        return jsonify({"templates": templates})

    @bp.route("/api/tour/plan", methods=["POST"])
    def api_tour_plan():
        cfg = load_ragflow_config_dict(deps=deps)
        data = parse_json_object_request(request)
        zone, profile, duration_s, stops_override, stop_durations_override = parse_tour_plan_request(
            data
        )
        if stops_override:
            plan = deps.tour_planner.make_plan_from_stops(
                zone=zone,
                profile=profile,
                duration_s=duration_s,
                stops=stops_override,
                source="override",
                stop_durations_override=stop_durations_override,
            )
        else:
            plan = deps.tour_planner.make_plan(
                cfg,
                zone=zone,
                profile=profile,
                duration_s=duration_s,
                stop_durations_override=stop_durations_override,
            )
        stops_meta = build_stops_meta(plan)
        return jsonify(
            {
                "zone": plan.zone,
                "profile": plan.profile,
                "duration_s": plan.duration_s,
                "stops": list(plan.stops),
                "stop_durations_s": list(getattr(plan, "stop_durations_s", ()) or ()),
                "stop_target_chars": list(getattr(plan, "stop_target_chars", ()) or ()),
                "stops_meta": stops_meta,
                "source": plan.source,
            }
        )

    return bp
