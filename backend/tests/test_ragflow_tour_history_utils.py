from __future__ import annotations

from types import SimpleNamespace

from backend.api.ragflow_tour_history_utils import (
    build_stops_meta,
    build_tour_templates,
    normalize_stops,
    parse_history_query,
    parse_tour_plan_request,
)


def test_parse_history_query_defaults_invalid_limit():
    req = SimpleNamespace(args={"sort": "freq", "order": "asc", "limit": "x"})
    q = parse_history_query(req)
    assert q.sort_mode == "freq"
    assert q.desc is False
    assert q.limit == 100


def test_normalize_stops_strips_empty():
    assert normalize_stops([" A ", "", "  ", "B"]) == ["A", "B"]


def test_build_tour_templates_prefers_app_templates():
    app_cfg = SimpleNamespace(
        tour_templates=[SimpleNamespace(id="t1", name="T1", zone="z1", profile="p1", stops=["A", "B"])]
    )
    got = build_tour_templates(app_cfg=app_cfg, raw_cfg={"tour_planner": {"routes": {"z2": ["X"]}}})
    assert len(got) == 1
    assert got[0]["id"] == "t1"
    assert got[0]["source"] == "ragflow_config.tour_templates"


def test_build_tour_templates_fallback_from_routes():
    app_cfg = SimpleNamespace(tour_templates=[])
    raw_cfg = {"tour_planner": {"routes": {"z1": ["A", "B"], "z2": ["C"]}}}
    got = build_tour_templates(app_cfg=app_cfg, raw_cfg=raw_cfg)
    assert len(got) == 2
    assert got[0]["source"] == "tour_planner.routes"


def test_parse_tour_plan_request_with_override():
    zone, profile, duration_s, stops = parse_tour_plan_request(
        {"zone": "z1", "profile": "p1", "duration_s": 80, "stops_override": [" A ", "", "B"]}
    )
    assert zone == "z1"
    assert profile == "p1"
    assert duration_s == 80
    assert stops == ["A", "B"]


class _Plan:
    stops = ["A", "B"]
    stop_durations_s = [10, 20]
    stop_target_chars = [30, 40]


def test_build_stops_meta_from_plan_fields():
    got = build_stops_meta(_Plan())
    assert got == [
        {"name": "A", "duration_s": 10, "target_chars": 30},
        {"name": "B", "duration_s": 20, "target_chars": 40},
    ]
