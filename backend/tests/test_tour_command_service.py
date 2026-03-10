from __future__ import annotations

import pytest

from backend.services.tour_command_service import TourCommandService


def test_tour_command_next_prev():
    svc = TourCommandService()
    assert svc.parse(text="下一站", stops=[]).action == "next"
    assert svc.parse(text="上一站", stops=[]).action == "prev"


def test_tour_command_jump_num():
    svc = TourCommandService()
    cmd = svc.parse(text="跳到第3站", stops=["A", "B", "C"])
    assert cmd.action == "jump"
    assert cmd.stop_index == 2


def test_tour_command_jump_name():
    svc = TourCommandService()
    cmd = svc.parse(text="去 骨科产品", stops=["公司介绍", "骨科产品", "泌尿产品"])
    assert cmd.action == "jump"
    assert cmd.stop_index == 1


def test_tour_command_pause_resume_restart():
    svc = TourCommandService()
    assert svc.parse(text="暂停讲解", stops=[]).action == "pause"
    assert svc.parse(text="恢复讲解", stops=[]).action == "resume"
    assert svc.parse(text="从头开始", stops=[]).action == "restart"


def test_tour_command_empty_and_no_match():
    svc = TourCommandService()

    empty = svc.parse(text="   ", stops=["A"])
    assert empty.intent == "none"
    assert empty.action == ""
    assert empty.confidence == 0.0
    assert empty.reason == "empty"

    no_match = svc.parse(text="今天天气不错", stops=["A"])
    assert no_match.intent == "none"
    assert no_match.action == ""
    assert no_match.confidence == 0.25
    assert no_match.reason == "no_match"


def test_tour_command_priority_pause_and_resume_before_next_prev():
    svc = TourCommandService()

    pause_first = svc.parse(text="暂停讲解然后下一站", stops=["A", "B"])
    assert pause_first.intent == "tour_command"
    assert pause_first.action == "pause"
    assert pause_first.reason == "keyword_pause"

    resume_first = svc.parse(text="继续讲解，下一站", stops=["A", "B"])
    assert resume_first.intent == "tour_command"
    assert resume_first.action == "resume"
    assert resume_first.reason == "keyword_resume"


@pytest.mark.parametrize(
    ("text", "expected_index"),
    [
        ("到第2站", 1),
        ("跳转到第4个", 3),
        ("去 5 站", 4),
    ],
)
def test_tour_command_jump_num_variants(text: str, expected_index: int):
    svc = TourCommandService()
    cmd = svc.parse(text=text, stops=["A", "B", "C", "D", "E"])
    assert cmd.intent == "tour_command"
    assert cmd.action == "jump"
    assert cmd.stop_index == expected_index
    assert cmd.reason == "jump_num"


def test_tour_command_jump_name_unresolved_when_no_stop_match():
    svc = TourCommandService()
    cmd = svc.parse(text="跳到 火星馆", stops=["公司介绍", "骨科产品"])
    assert cmd.intent == "tour_command"
    assert cmd.action == "jump"
    assert cmd.stop_index is None
    assert cmd.stop_name == "火星馆"
    assert cmd.reason == "jump_name_unresolved"
    assert abs(float(cmd.confidence) - 0.6) < 1e-9


def test_tour_command_jump_name_prefers_first_fuzzy_match_in_current_logic():
    svc = TourCommandService()
    cmd = svc.parse(text="去 骨科产品", stops=["产品", "骨科产品", "泌尿产品"])
    # Current implementation returns the first fuzzy match (`s in name`).
    assert cmd.action == "jump"
    assert cmd.stop_index == 0
    assert cmd.stop_name == "产品"
    assert cmd.reason == "jump_name"
