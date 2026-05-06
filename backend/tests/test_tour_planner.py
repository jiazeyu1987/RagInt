from __future__ import annotations

import pytest

from backend.services.tour_planner import TourPlanner


def test_tour_planner_allows_20min_duration():
    planner = TourPlanner()
    cfg = {"tour_planner": {"routes": {"z": ["A", "B", "C", "D", "E", "F"]}}}
    plan = planner.make_plan(cfg, zone="z", profile="p", duration_s=1200)
    assert plan.duration_s == 1200
    assert len(plan.stops) == 6
    assert sum(plan.stop_durations_s) >= 1200 - 6  # rounding tolerance


def test_tour_planner_applies_stop_duration_override():
    planner = TourPlanner()
    plan = planner.make_plan_from_stops(
        zone="z",
        profile="p",
        duration_s=100,
        stops=["A", "B", "C"],
        stop_durations_override={"A": 11, "C": 33},
    )
    assert list(plan.stop_durations_s) == [11, 33, 33]


def test_tour_planner_fails_when_config_has_no_route_stops():
    planner = TourPlanner()

    with pytest.raises(ValueError, match="tour_route_stops_required"):
        planner.make_plan({"tour_planner": {"routes": {}}}, zone="z", profile="p", duration_s=60)

    with pytest.raises(ValueError, match="tour_route_stops_required"):
        planner.make_plan({"tour": {"stops": ["legacy"]}}, zone="z", profile="p", duration_s=60)


def test_tour_planner_fails_when_override_stops_are_empty():
    planner = TourPlanner()

    with pytest.raises(ValueError, match="tour_stops_required"):
        planner.make_plan_from_stops(zone="z", profile="p", duration_s=60, stops=[])


def test_tour_planner_fails_on_invalid_duration():
    planner = TourPlanner()
    cfg = {"tour_planner": {"routes": {"z": ["A", "B"]}}}

    with pytest.raises(ValueError, match="invalid_duration_s"):
        planner.make_plan(cfg, zone="z", profile="p", duration_s="bad")

    with pytest.raises(ValueError, match="invalid_duration_s"):
        planner.make_plan_from_stops(zone="z", profile="p", duration_s="bad", stops=["A"])


def test_tour_planner_fails_on_invalid_stop_duration_override():
    planner = TourPlanner()

    with pytest.raises(ValueError, match="invalid_stop_durations_override"):
        planner.make_plan_from_stops(
            zone="z",
            profile="p",
            duration_s=60,
            stops=["A", "B"],
            stop_durations_override={"A": "bad"},
        )


def test_tour_planner_fails_on_invalid_configured_stop_duration_and_cps():
    planner = TourPlanner()

    with pytest.raises(ValueError, match="invalid_stop_durations_s"):
        planner.make_plan(
            {"tour_planner": {"routes": {"z": ["A"]}, "stop_durations_s": ["bad"]}},
            zone="z",
            profile="p",
            duration_s=60,
        )

    with pytest.raises(ValueError, match="invalid_chars_per_second"):
        planner.make_plan(
            {"tour_planner": {"routes": {"z": ["A"]}, "chars_per_second": "bad"}},
            zone="z",
            profile="p",
            duration_s=60,
        )
