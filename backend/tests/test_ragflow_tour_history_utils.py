from __future__ import annotations

from types import SimpleNamespace

from backend.api.ragflow_tour_history_utils import (
    RagflowTourHistoryContractError,
    build_stops_meta,
    build_tour_templates,
    normalize_stops,
    parse_history_query,
    parse_tour_plan_request,
)


def test_parse_history_query_rejects_invalid_limit():
    req = SimpleNamespace(args={"sort": "freq", "order": "asc", "limit": "x"})

    try:
        parse_history_query(req)
    except RagflowTourHistoryContractError as exc:
        assert exc.error == "history_query_invalid"
        assert exc.detail == "history query limit must be an integer"
    else:
        raise AssertionError("expected invalid history limit to fail fast")


def test_parse_history_query_rejects_empty_explicit_limit():
    req = SimpleNamespace(args={"sort": "freq", "order": "asc", "limit": ""})

    try:
        parse_history_query(req)
    except RagflowTourHistoryContractError as exc:
        assert exc.error == "history_query_invalid"
        assert exc.detail == "history query limit must be an integer"
    else:
        raise AssertionError("expected empty explicit history limit to fail fast")


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


def test_build_tour_templates_does_not_fallback_from_routes():
    app_cfg = SimpleNamespace(tour_templates=[])
    raw_cfg = {"tour_planner": {"routes": {"z1": ["A", "B"], "z2": ["C"]}}}
    got = build_tour_templates(app_cfg=app_cfg, raw_cfg=raw_cfg)
    assert got == []


def test_parse_tour_plan_request_with_override():
    zone, profile, duration_s, stops, stop_durations = parse_tour_plan_request(
        {"zone": "z1", "profile": "p1", "duration_s": 80, "stops_override": [" A ", "", "B"]}
    )
    assert zone == "z1"
    assert profile == "p1"
    assert duration_s == 80
    assert stops == ["A", "B"]
    assert stop_durations is None


def test_parse_tour_plan_request_with_stop_duration_override():
    zone, profile, duration_s, stops, stop_durations = parse_tour_plan_request(
        {
            "zone": "z1",
            "profile": "p1",
            "duration_s": 80,
            "stop_durations_s_override": {"A": "12", "B": 0, "": 5},
        }
    )
    assert zone == "z1"
    assert profile == "p1"
    assert duration_s == 80
    assert stops is None
    assert stop_durations == {"A": 12}


def test_parse_tour_plan_request_rejects_invalid_stop_duration_override():
    try:
        parse_tour_plan_request({"stop_durations_s_override": {"A": "bad"}})
    except RagflowTourHistoryContractError as exc:
        assert exc.error == "tour_plan_request_invalid"
        assert exc.detail == "stop_durations_s_override.A must be an integer"
    else:
        raise AssertionError("expected invalid stop duration override to fail fast")


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


def test_build_stops_meta_rejects_unparseable_plan_fields():
    class _InvalidPlan:
        stops = ["A"]
        stop_durations_s = ["bad"]
        stop_target_chars = [30]

    try:
        build_stops_meta(_InvalidPlan())
    except RagflowTourHistoryContractError as exc:
        assert exc.error == "tour_plan_invalid"
        assert exc.detail == "plan.stop_durations_s[0] must be an integer"
    else:
        raise AssertionError("expected invalid plan stop duration to fail fast")
