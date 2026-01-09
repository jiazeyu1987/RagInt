from __future__ import annotations

from backend.services.tour_planner import TourPlanner


def test_tour_planner_allows_20min_duration():
    planner = TourPlanner()
    cfg = {"tour": {"stops": ["A", "B", "C", "D", "E", "F"]}}
    plan = planner.make_plan(cfg, zone="默认路线", profile="大众", duration_s=1200)
    assert plan.duration_s == 1200
    assert len(plan.stops) == 6
    assert sum(plan.stop_durations_s) >= 1200 - 6  # rounding tolerance

