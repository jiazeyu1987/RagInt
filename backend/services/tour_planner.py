from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TourPlan:
    zone: str
    profile: str
    duration_s: int
    stops: tuple[str, ...]
    stop_durations_s: tuple[int, ...]
    stop_target_chars: tuple[int, ...]
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

        # Per-stop duration planning.
        # Allow three forms:
        # - tour_planner.stop_durations_s: { "<zone>": [..] } (zone-specific list aligned with stops)
        # - tour_planner.stop_durations_s: [..] (global list aligned with stops)
        # - tour_planner.stop_durations_s: { "<stop name>": seconds } (name->seconds)
        durations_cfg = tour_cfg.get("stop_durations_s")
        durations_list = None
        durations_by_name = None
        if isinstance(durations_cfg, dict):
            maybe_zone = durations_cfg.get(zone)
            if isinstance(maybe_zone, list):
                durations_list = maybe_zone
            else:
                durations_by_name = durations_cfg
        elif isinstance(durations_cfg, list):
            durations_list = durations_cfg

        stop_durations = []
        if durations_list is not None:
            for i, _s in enumerate(stops_norm):
                try:
                    v = durations_list[i] if i < len(durations_list) else None
                    n = int(v)
                except Exception:
                    n = 0
                stop_durations.append(max(0, n))
        elif isinstance(durations_by_name, dict):
            for s in stops_norm:
                try:
                    n = int(durations_by_name.get(s) or 0)
                except Exception:
                    n = 0
                stop_durations.append(max(0, n))

        # Fallback: allocate total duration evenly.
        if not stop_durations or len(stop_durations) != len(stops_norm) or sum(stop_durations) <= 0:
            per = max(15, int(round(float(duration_s) / max(1, len(stops_norm)))))
            stop_durations = [per for _ in stops_norm]

        # Derive per-stop target chars for Chinese speech planning (heuristic).
        # Default: ~4.5 chars/s; configurable via tour_planner.chars_per_second.
        try:
            cps = float(tour_cfg.get("chars_per_second") or 4.5)
        except Exception:
            cps = 4.5
        cps = max(2.5, min(cps, 8.0))
        stop_target_chars = [max(20, int(round(float(d) * cps))) for d in stop_durations]

        return TourPlan(
            zone=zone,
            profile=profile,
            duration_s=duration_s,
            stops=tuple(stops_norm),
            stop_durations_s=tuple(stop_durations),
            stop_target_chars=tuple(stop_target_chars),
            source=source,
        )
