from __future__ import annotations

import re


_QUESTION_CUT_MARKERS = (
    "\n\n讲解生成要求：",
    "\n\n【回答要求】",
    "\n\n【本展柜卖点 Top",
    "\n\n【口播讲解稿约束】",
)


def extract_base_question(raw_question: str) -> str:
    """
    Keep only the user/base question.

    This removes appended prompt blocks and metadata sections so cache/history keys
    are stable and readable in QA-audio-cache management.
    """
    text = str(raw_question or "").strip()
    if not text:
        return ""

    cut_at = len(text)
    for marker in _QUESTION_CUT_MARKERS:
        i = text.find(marker)
        if i >= 0:
            cut_at = min(cut_at, i)
    text = text[:cut_at].strip()

    # For front-end generated multi-line prompts, keep only the lead lines before
    # section metadata like "【...】" / bullets.
    lines = [ln.strip() for ln in text.splitlines()]
    kept: list[str] = []
    for ln in lines:
        if not ln:
            if kept:
                break
            continue
        if ln.startswith("【") and "】" in ln:
            break
        if ln.startswith("- "):
            break
        kept.append(ln)

    if kept:
        text = " ".join(kept).strip()

    text = re.sub(r"\s+", " ", text).strip()
    return text


def apply_explanation_script_requirements(question_for_rag: str, *, enabled: bool = True) -> str:
    if not enabled:
        return str(question_for_rag or "")
    base = str(question_for_rag or "")
    marker = "【口播讲解稿约束】"
    if marker in base:
        return base

    req = (
        "\n\n【口播讲解稿约束】\n"
        "请用可直接播报的讲解稿风格回复，语言自然连贯。\n"
        "仅输出正文，不要标题、列表、分点、序号。\n"
        "不要使用特殊符号或格式标记（如【】[]{}<>#*`~^|）。\n"
        "必须使用基础标点（，。；：！？）自然断句，便于TTS分段。\n"
    )
    return f"{base}{req}"

