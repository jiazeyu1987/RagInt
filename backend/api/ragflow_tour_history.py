from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.api.ragflow_config_cache import get_ragflow_app_config, get_ragflow_bundle, get_ragflow_config
from backend.api.ragflow_tour_history_utils import (
    build_stops_meta,
    build_tour_templates,
    fallback_stops,
    normalize_stops,
    parse_history_query,
    parse_tour_plan_request,
)


def create_blueprint(deps):
    bp = Blueprint("ragflow_tour_history_api", __name__)

    @bp.route("/api/ragflow/chats", methods=["GET"])
    def ragflow_list_chats():
        return jsonify(deps.ragflow_service.list_chats())

    @bp.route("/api/ragflow/chats/clear_sessions", methods=["POST"])
    def ragflow_clear_chat_sessions():
        data = request.get_json(silent=True) or {}
        chat_name = str((data.get("chat_name") if isinstance(data, dict) else "") or "").strip()
        result = deps.ragflow_service.clear_chat_sessions(chat_name)
        status = 200 if result.get("ok") else 500
        return jsonify(result), status

    @bp.route("/api/ragflow/agents", methods=["GET"])
    def ragflow_list_agents():
        res = deps.ragflow_service.list_agents()
        try:
            deps.logger.info(f"ragflow_agents_list count={len(res.get('agents') or [])}")
        except Exception:
            pass
        return jsonify(res)

    @bp.route("/api/history", methods=["GET"])
    def api_history_list():
        q = parse_history_query(request)
        if q.sort_mode in ("count", "freq", "frequency"):
            items = deps.history_store.list_by_count(limit=q.limit, desc=q.desc)
            return jsonify({"sort": "count", "items": items})
        items = deps.history_store.list_by_time(limit=q.limit, desc=q.desc)
        return jsonify({"sort": "time", "items": items})

    @bp.route("/api/tour/stops", methods=["GET"])
    def api_tour_stops():
        app_cfg = get_ragflow_app_config(deps=deps)
        stops = list(app_cfg.tour.stops or [])
        source = "default"
        if stops:
            source = "ragflow_config.tour.stops"
        else:
            stops = fallback_stops()
        stops = normalize_stops(stops)
        return jsonify({"stops": stops, "source": source})

    @bp.route("/api/tour/meta", methods=["GET"])
    def api_tour_meta():
        cfg = get_ragflow_config(deps=deps)
        meta = deps.tour_planner.get_meta(cfg if isinstance(cfg, dict) else {})
        return jsonify(meta)

    @bp.route("/api/tour/templates", methods=["GET"])
    def api_tour_templates():
        cfg, app_cfg = get_ragflow_bundle(deps=deps)
        templates = build_tour_templates(app_cfg=app_cfg, raw_cfg=(cfg if isinstance(cfg, dict) else {}))
        return jsonify({"templates": templates})

    @bp.route("/api/tour/plan", methods=["POST"])
    def api_tour_plan():
        cfg = get_ragflow_config(deps=deps)
        data = request.get_json() or {}
        zone, profile, duration_s, stops_override, stop_durations_override = parse_tour_plan_request(
            data if isinstance(data, dict) else {}
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
                cfg if isinstance(cfg, dict) else {},
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
