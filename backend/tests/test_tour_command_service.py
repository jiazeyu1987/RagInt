from __future__ import annotations

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

