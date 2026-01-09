from __future__ import annotations

from flask import Blueprint, jsonify, request


def create_blueprint(deps):
    bp = Blueprint("ragflow_tour_history_api", __name__)

    @bp.route("/api/ragflow/chats", methods=["GET"])
    def ragflow_list_chats():
        return jsonify(deps.ragflow_service.list_chats())

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
        sort_mode = (request.args.get("sort") or "time").strip().lower()
        order = (request.args.get("order") or "desc").strip().lower()
        limit = int(request.args.get("limit") or 100)
        desc = order != "asc"

        if sort_mode in ("count", "freq", "frequency"):
            items = deps.history_store.list_by_count(limit=limit, desc=desc)
            return jsonify({"sort": "count", "items": items})

        items = deps.history_store.list_by_time(limit=limit, desc=desc)
        return jsonify({"sort": "time", "items": items})

    @bp.route("/api/tour/stops", methods=["GET"])
    def api_tour_stops():
        cfg = deps.ragflow_service.load_config() or {}
        tour_cfg = cfg.get("tour", {}) if isinstance(cfg, dict) else {}
        stops = tour_cfg.get("stops") if isinstance(tour_cfg, dict) else None
        source = "default"
        if isinstance(stops, list) and stops:
            source = "ragflow_config.tour.stops"
        else:
            stops = [
                "公司总体介绍",
                "核心产品概览",
                "骨科产品",
                "泌尿产品",
                "其他产品与应用场景",
                "总结与提问引导",
            ]
        stops = [str(s).strip() for s in stops if str(s).strip()]
        return jsonify({"stops": stops, "source": source})

    @bp.route("/api/tour/meta", methods=["GET"])
    def api_tour_meta():
        cfg = deps.ragflow_service.load_config() or {}
        meta = deps.tour_planner.get_meta(cfg if isinstance(cfg, dict) else {})
        return jsonify(meta)

    @bp.route("/api/tour/templates", methods=["GET"])
    def api_tour_templates():
        cfg = deps.ragflow_service.load_config() or {}
        templates = []

        try:
            raw = cfg.get("tour_templates") if isinstance(cfg, dict) else None
            if isinstance(raw, list):
                for t in raw:
                    if not isinstance(t, dict):
                        continue
                    tid = str(t.get("id") or t.get("name") or "").strip()
                    name = str(t.get("name") or tid or "").strip()
                    zone = str(t.get("zone") or "").strip()
                    profile = str(t.get("profile") or "").strip()
                    stops = t.get("stops")
                    if not isinstance(stops, list):
                        stops = []
                    stops = [str(s).strip() for s in stops if str(s).strip()]
                    if not tid or not name or not stops:
                        continue
                    templates.append({"id": tid, "name": name, "zone": zone, "profile": profile, "stops": stops, "source": "ragflow_config.tour_templates"})
        except Exception:
            templates = []

        # Fallback: take up to 3 routes from tour_planner.routes
        if not templates:
            try:
                tour_cfg = (cfg or {}).get("tour_planner") if isinstance(cfg, dict) else {}
                routes = tour_cfg.get("routes") if isinstance(tour_cfg, dict) else None
                if isinstance(routes, dict):
                    for zone, stops in routes.items():
                        if len(templates) >= 3:
                            break
                        if not isinstance(stops, list) or not stops:
                            continue
                        z = str(zone or "").strip()
                        ss = [str(s).strip() for s in stops if str(s).strip()]
                        if not z or not ss:
                            continue
                        templates.append({"id": z, "name": z, "zone": z, "profile": "", "stops": ss, "source": "tour_planner.routes"})
            except Exception:
                templates = []

        return jsonify({"templates": templates})

    @bp.route("/api/tour/plan", methods=["POST"])
    def api_tour_plan():
        cfg = deps.ragflow_service.load_config() or {}
        data = request.get_json() or {}
        zone = str((data.get("zone") or "")).strip()
        profile = str((data.get("profile") or "")).strip()
        duration_s = data.get("duration_s") or 60
        stops_override = data.get("stops_override")
        if isinstance(stops_override, list) and stops_override:
            plan = deps.tour_planner.make_plan_from_stops(
                zone=zone,
                profile=profile,
                duration_s=duration_s,
                stops=[str(s).strip() for s in stops_override if str(s).strip()],
                source="override",
            )
        else:
            plan = deps.tour_planner.make_plan(cfg if isinstance(cfg, dict) else {}, zone=zone, profile=profile, duration_s=duration_s)
        stops_meta = []
        try:
            for name, d, tc in zip(list(plan.stops), list(plan.stop_durations_s), list(plan.stop_target_chars)):
                stops_meta.append({"name": str(name), "duration_s": int(d), "target_chars": int(tc)})
        except Exception:
            stops_meta = [{"name": str(s)} for s in list(plan.stops)]
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
