from __future__ import annotations

from backend.services.tour_planner import TourPlanner


def test_tour_planner_allows_20min_duration():
    planner = TourPlanner()
    cfg = {"tour": {"stops": ["A", "B", "C", "D", "E", "F"]}}
    plan = planner.make_plan(cfg, zone="榛樿璺嚎", profile="澶т紬", duration_s=1200)
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
