from __future__ import annotations

from backend.orchestrators.guide_prompt import apply_guide_prompt


def test_apply_guide_prompt_noop_when_disabled():
    assert apply_guide_prompt(raw_question="Q", guide=None) == "Q"
    assert apply_guide_prompt(raw_question="Q", guide={}) == "Q"
    assert apply_guide_prompt(raw_question="Q", guide={"enabled": False}) == "Q"


def test_apply_guide_prompt_enforces_single_paragraph_output_rules():
    out = apply_guide_prompt(
        raw_question="请介绍这个展区",
        guide={"enabled": True, "style": "friendly", "duration_s": 30, "stop_name": "展区A"},
    )
    assert "当前展厅：展区A" in out
    assert "只输出一整段连续讲解正文" in out
    assert "不要分点" in out
    assert "不要使用括号标签或特殊格式符号" in out
    assert "必须使用基础标点（，。；：！？）进行自然断句" in out


def test_apply_guide_prompt_continuous_instructions_present():
    out = apply_guide_prompt(
        raw_question="继续讲解",
        guide={"enabled": True, "continuous": True, "duration_s": 60},
    )
    assert "连续讲解要求" in out
