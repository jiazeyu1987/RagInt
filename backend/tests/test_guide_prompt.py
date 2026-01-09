from __future__ import annotations

from backend.orchestrators.guide_prompt import apply_guide_prompt


def test_apply_guide_prompt_noop_when_disabled():
    assert apply_guide_prompt(raw_question="Q", guide=None) == "Q"
    assert apply_guide_prompt(raw_question="Q", guide={}) == "Q"
    assert apply_guide_prompt(raw_question="Q", guide={"enabled": False}) == "Q"


def test_apply_guide_prompt_includes_structure_30s():
    out = apply_guide_prompt(
        raw_question="介绍一下这个展柜",
        guide={"enabled": True, "style": "friendly", "duration_s": 30, "stop_name": "展柜A"},
    )
    assert "【展厅讲解要求】" in out
    assert "当前展厅：展柜A" in out
    assert "输出结构" in out
    assert "【30秒概览】" in out
    assert "【重点产品/卖点】" in out
    assert "【互动引导】" in out


def test_apply_guide_prompt_includes_structure_longer():
    out = apply_guide_prompt(
        raw_question="介绍一下这个展柜",
        guide={"enabled": True, "style": "pro", "duration_s": 180, "stop_name": "展柜B"},
    )
    assert "【深入讲解】" in out
    assert "【常见问答】" in out


def test_apply_guide_prompt_continuous_instructions_present():
    out = apply_guide_prompt(
        raw_question="继续讲",
        guide={"enabled": True, "continuous": True, "duration_s": 60},
    )
    assert "衔接（连续讲解）" in out

