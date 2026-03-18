from __future__ import annotations

import re


_QUESTION_CUT_MARKERS = (
    "\n\n讲解生成要求：",
    "\n\n【回答要求】",
    "\n\n【本展柜卖点 Top",
    "\n\n【口播讲解约束】",
    "\n\n[CONTEXT_MEMORY]",
    "\n\n[CONTEXT_SUMMARY]",
    "\n\n[RECENT_TURNS]",
    "\n\n[CURRENT_QUESTION]",
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


def _norm_answer_target_chars(value: int | float | str | None) -> int:
    try:
        n = int(value if value is not None else 0)
    except Exception:
        n = 0
    if n <= 0:
        return 0
    return max(1, min(n, 5000))


def _norm_audience_profile(value: str | None) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return ""
    return text[:40]


def apply_explanation_script_requirements(
    question_for_rag: str,
    *,
    enabled: bool = True,
    answer_target_chars: int | float | str | None = None,
    audience_profile: str | None = None,
) -> str:
    if not enabled:
        return str(question_for_rag or "")
    base = str(question_for_rag or "")
    marker = "【口播讲解约束】"

    target_chars = _norm_answer_target_chars(answer_target_chars)
    target_line = f"回答长度控制：约{target_chars}个字。\n" if target_chars > 0 else ""
    profile = _norm_audience_profile(audience_profile)
    style_line = (
        f"请用可直接播报的讲解稿风格回复，语言自然连贯，风格参考受众画像：{profile}。\n"
        if profile
        else "请用可直接播报的讲解稿风格回复，语言自然连贯。\n"
    )

    if marker in base:
        if not target_line and not profile:
            return base
        cleaned = base
        if target_line:
            cleaned = re.sub(r"回答长度控制：[^\n\r]*(?:\r?\n)?", "", cleaned)
        if profile:
            cleaned = re.sub(r"请用可直接播报的讲解稿风格回复[^\n\r]*(?:\r?\n)?", "", cleaned)
            cleaned = re.sub(rf"{re.escape(marker)}(?:\r?\n)?", f"{marker}\n{style_line}", cleaned, count=1)
        if not target_line:
            return cleaned
        if not cleaned.endswith("\n"):
            cleaned += "\n"
        cleaned += target_line
        return cleaned

    req = (
        "\n\n【口播讲解约束】\n"
        f"{style_line}"
        "仅输出正文，不要标题、列表、分点、序号。\n"
        "不要使用特殊符号或格式标记（如【】[]{}<>#*`~^|）。\n"
        "必须使用基础标点（，。；：！？）自然断句，便于TTS分段。\n"
        f"{target_line}"
    )
    return f"{base}{req}"
