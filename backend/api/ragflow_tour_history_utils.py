from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HistoryQuery:
    sort_mode: str
    desc: bool
    limit: int


def parse_history_query(req) -> HistoryQuery:
    sort_mode = (req.args.get("sort") or "time").strip().lower()
    order = (req.args.get("order") or "desc").strip().lower()
    try:
        limit = int(req.args.get("limit") or 100)
    except Exception:
        limit = 100
    return HistoryQuery(sort_mode=sort_mode, desc=(order != "asc"), limit=limit)


def fallback_stops() -> list[str]:
    return [
        "company_overview",
        "core_products",
        "orthopedics",
        "urology",
        "other_products_and_scenarios",
        "summary_and_qa",
    ]


def normalize_stops(stops) -> list[str]:
    return [str(s).strip() for s in list(stops or []) if str(s).strip()]


def build_tour_templates(*, app_cfg, raw_cfg) -> list[dict]:
    templates = []
    for t in list(app_cfg.tour_templates or []):
        templates.append(
            {
                "id": t.id,
                "name": t.name,
                "zone": t.zone,
                "profile": t.profile,
                "stops": list(t.stops or []),
                "source": "ragflow_config.tour_templates",
            }
        )

    if templates:
        return templates

    try:
        tour_cfg = (raw_cfg or {}).get("tour_planner") if isinstance(raw_cfg, dict) else {}
        routes = tour_cfg.get("routes") if isinstance(tour_cfg, dict) else None
        if not isinstance(routes, dict):
            return []
        for zone, stops in routes.items():
            if len(templates) >= 3:
                break
            if not isinstance(stops, list) or not stops:
                continue
            z = str(zone or "").strip()
            ss = normalize_stops(stops)
            if not z or not ss:
                continue
            templates.append({"id": z, "name": z, "zone": z, "profile": "", "stops": ss, "source": "tour_planner.routes"})
    except Exception:
        return []
    return templates


def parse_tour_plan_request(data: dict) -> tuple[str, str, int | float, list[str] | None]:
    zone = str((data.get("zone") or "")).strip()
    profile = str((data.get("profile") or "")).strip()
    duration_s = data.get("duration_s") or 60
    stops_override = data.get("stops_override")
    if isinstance(stops_override, list) and stops_override:
        return zone, profile, duration_s, normalize_stops(stops_override)
    return zone, profile, duration_s, None


def build_stops_meta(plan) -> list[dict]:
    try:
        out = []
        for name, d, tc in zip(list(plan.stops), list(plan.stop_durations_s), list(plan.stop_target_chars)):
            out.append({"name": str(name), "duration_s": int(d), "target_chars": int(tc)})
        return out
    except Exception:
        return [{"name": str(s)} for s in list(plan.stops)]
