from __future__ import annotations

from dataclasses import dataclass

from werkzeug.exceptions import BadRequest


class RagflowTourHistoryContractError(RuntimeError):
    def __init__(self, *, error: str, detail: str, status_code: int = 500):
        super().__init__(detail)
        self.error = error
        self.detail = detail
        self.status_code = int(status_code)


@dataclass(frozen=True)
class HistoryQuery:
    sort_mode: str
    desc: bool
    limit: int


def parse_history_query(req) -> HistoryQuery:
    sort_mode = (req.args.get("sort") or "time").strip().lower()
    order = (req.args.get("order") or "desc").strip().lower()
    raw_limit = req.args.get("limit") if "limit" in req.args else 100
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError) as exc:
        raise RagflowTourHistoryContractError(
            error="history_query_invalid",
            detail="history query limit must be an integer",
            status_code=400,
        ) from exc
    return HistoryQuery(sort_mode=sort_mode, desc=(order != "asc"), limit=limit)


def parse_json_object_request(req) -> dict:
    try:
        data = req.get_json()
    except BadRequest as exc:
        raise RagflowTourHistoryContractError(
            error="request_body_invalid",
            detail="request body must be valid JSON object",
            status_code=400,
        ) from exc
    if not isinstance(data, dict):
        raise RagflowTourHistoryContractError(
            error="request_body_invalid",
            detail="request body must be valid JSON object",
            status_code=400,
        )
    return data


def normalize_stops(stops) -> list[str]:
    return [str(s).strip() for s in list(stops or []) if str(s).strip()]


def require_history_items(items, *, source: str) -> list:
    if not isinstance(items, list):
        raise RagflowTourHistoryContractError(
            error="history_store_invalid_response",
            detail=f"{source} must return a list",
        )
    return items


def load_ragflow_config_dict(*, deps, force: bool = False) -> dict:
    cfg = deps.ragflow_service.load_config(force=bool(force))
    if not isinstance(cfg, dict):
        raise RagflowTourHistoryContractError(
            error="ragflow_config_invalid",
            detail="ragflow_service.load_config must return a dict",
        )
    return cfg


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
    return []


def _normalize_stop_durations_override(raw) -> dict[str, int] | list[int] | None:
    if isinstance(raw, list):
        out: list[int] = []
        for idx, v in enumerate(raw):
            try:
                n = int(v)
            except (TypeError, ValueError) as exc:
                raise RagflowTourHistoryContractError(
                    error="tour_plan_request_invalid",
                    detail=f"stop_durations_s_override[{idx}] must be an integer",
                ) from exc
            out.append(max(0, n))
        if any(x > 0 for x in out):
            return out
        return None

    if isinstance(raw, dict):
        out: dict[str, int] = {}
        for k, v in raw.items():
            key = str(k or "").strip()
            if not key:
                continue
            try:
                n = int(v)
            except (TypeError, ValueError) as exc:
                raise RagflowTourHistoryContractError(
                    error="tour_plan_request_invalid",
                    detail=f"stop_durations_s_override.{key} must be an integer",
                ) from exc
            if n > 0:
                out[key] = n
        return out or None

    return None


def parse_tour_plan_request(
    data: dict,
) -> tuple[str, str, int | float, list[str] | None, dict[str, int] | list[int] | None]:
    zone = str((data.get("zone") or "")).strip()
    profile = str((data.get("profile") or "")).strip()
    duration_s = data.get("duration_s") or 10
    stop_durations_override = _normalize_stop_durations_override(data.get("stop_durations_s_override"))
    stops_override = data.get("stops_override")
    if isinstance(stops_override, list) and stops_override:
        return zone, profile, duration_s, normalize_stops(stops_override), stop_durations_override
    return zone, profile, duration_s, None, stop_durations_override


def build_stops_meta(plan) -> list[dict]:
    out = []
    try:
        stops = list(plan.stops)
        durations = list(plan.stop_durations_s)
        target_chars = list(plan.stop_target_chars)
    except (AttributeError, TypeError) as exc:
        raise RagflowTourHistoryContractError(
            error="tour_plan_invalid",
            detail="plan stops metadata must include stops, stop_durations_s, and stop_target_chars lists",
        ) from exc

    if not (len(stops) == len(durations) == len(target_chars)):
        raise RagflowTourHistoryContractError(
            error="tour_plan_invalid",
            detail="plan stops metadata lists must have the same length",
        )

    for idx, (name, d, tc) in enumerate(zip(stops, durations, target_chars)):
        try:
            duration_s = int(d)
        except (TypeError, ValueError) as exc:
            raise RagflowTourHistoryContractError(
                error="tour_plan_invalid",
                detail=f"plan.stop_durations_s[{idx}] must be an integer",
            ) from exc
        try:
            target_char_count = int(tc)
        except (TypeError, ValueError) as exc:
            raise RagflowTourHistoryContractError(
                error="tour_plan_invalid",
                detail=f"plan.stop_target_chars[{idx}] must be an integer",
            ) from exc
        out.append({"name": str(name), "duration_s": duration_s, "target_chars": target_char_count})
    return out
