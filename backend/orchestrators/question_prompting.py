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


def apply_explanation_script_requirements(
    question_for_rag: str,
    *,
    enabled: bool = True,
    answer_target_chars: int | float | str | None = None,
    audience_profile: str | None = None,
) -> str:
    base = str(question_for_rag or "")
    if not enabled:
        return base

    # Keep parameters for API compatibility.
    _ = answer_target_chars
    _ = audience_profile

    # Stop injecting explanation-script constraints. Also strip historical
    # constraint blocks if they are already present in the incoming question.
    cleaned = re.sub(r"\n\n【口播讲解(?:稿)?约束】[\s\S]*$", "", base).strip()
    return cleaned
