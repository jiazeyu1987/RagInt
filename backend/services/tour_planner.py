from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TourPlan:
    zone: str
    profile: str
    duration_s: int
    stops: tuple[str, ...]
    source: str


class TourPlanner:
    """
    Simple (config-driven) tour route planner for exhibit-hall guided explanations.
    """

    def __init__(self):
        pass

    @staticmethod
    def _normalize_str(v: str) -> str:
        return str(v or "").strip()

    def get_meta(self, cfg: dict) -> dict:
        tour_cfg = (cfg or {}).get("tour_planner") if isinstance(cfg, dict) else {}
        if not isinstance(tour_cfg, dict):
            tour_cfg = {}

        zones = tour_cfg.get("zones")
        if not isinstance(zones, list) or not zones:
            zones = ["默认路线"]

        profiles = tour_cfg.get("profiles")
        if not isinstance(profiles, list) or not profiles:
            profiles = ["大众", "儿童", "专业"]

        default_zone = self._normalize_str(tour_cfg.get("default_zone") or zones[0])
        if default_zone not in zones:
            default_zone = zones[0]

        default_profile = self._normalize_str(tour_cfg.get("default_profile") or profiles[0])
        if default_profile not in profiles:
            default_profile = profiles[0]

        return {
            "zones": [self._normalize_str(z) for z in zones if self._normalize_str(z)],
            "profiles": [self._normalize_str(p) for p in profiles if self._normalize_str(p)],
            "default_zone": default_zone,
            "default_profile": default_profile,
        }

    def make_plan(self, cfg: dict, *, zone: str, profile: str, duration_s: int) -> TourPlan:
        zone = self._normalize_str(zone) or "默认路线"
        profile = self._normalize_str(profile) or "大众"
        try:
            duration_s = int(duration_s)
        except Exception:
            duration_s = 60
        duration_s = max(15, min(duration_s, 600))

        tour_cfg = (cfg or {}).get("tour_planner") if isinstance(cfg, dict) else {}
        if not isinstance(tour_cfg, dict):
            tour_cfg = {}

        routes = tour_cfg.get("routes")
        if not isinstance(routes, dict):
            routes = {}

        stops = routes.get(zone)
        source = "tour_planner.routes"
        if not isinstance(stops, list) or not stops:
            # Backward compat: allow tour.stops
            legacy = (cfg or {}).get("tour") if isinstance(cfg, dict) else {}
            legacy_stops = legacy.get("stops") if isinstance(legacy, dict) else None
            if isinstance(legacy_stops, list) and legacy_stops:
                stops = legacy_stops
                source = "tour.stops"
            else:
                stops = [
                    "公司总体介绍",
                    "核心产品概览",
                    "骨科产品",
                    "泌尿产品",
                    "其他产品与应用场景",
                    "总结与提问引导",
                ]
                source = "default"

        stops_norm = [self._normalize_str(s) for s in stops if self._normalize_str(s)]
        if not stops_norm:
            stops_norm = ["公司总体介绍"]
            source = "default"

        # Optional duration-based trimming (disabled by default for exhibition tours).
        trim_by_duration = bool(tour_cfg.get("trim_by_duration", False))
        if trim_by_duration:
            # 30s => 2 stops, 60s => 3-4, 180s => full.
            if duration_s <= 35:
                keep = min(len(stops_norm), 2)
            elif duration_s <= 90:
                keep = min(len(stops_norm), 4)
            else:
                keep = len(stops_norm)
            stops_norm = stops_norm[:keep]

        return TourPlan(
            zone=zone,
            profile=profile,
            duration_s=duration_s,
            stops=tuple(stops_norm),
            source=source,
        )
