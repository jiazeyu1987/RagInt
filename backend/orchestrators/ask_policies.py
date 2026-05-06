from __future__ import annotations

import contextlib


def apply_qa_requirements(
    question_for_rag: str,
    *,
    apply: bool,
    no_self_intro: bool,
    max_answer_chars: int,
) -> str:
    if not apply:
        return question_for_rag

    req_lines: list[str] = []
    if no_self_intro:
        req_lines.append("- 直接回答问题，不要自我介绍（不要出现“我是...”“我叫...”等）。")
    if int(max_answer_chars) > 0:
        req_lines.append(f"- 总字数不超过{int(max_answer_chars)}字。")
    if not req_lines:
        return question_for_rag
    return f"{question_for_rag}\n\n【回答要求】\n" + "\n".join(req_lines) + "\n"


def apply_selling_points_topn_hint(
    question_for_rag: str,
    *,
    guide: dict,
    selling_points_store,
    logger=None,
) -> str:
    """
    In guide mode, inject top-N selling points as extra context.
    - Use duration/profile to pick a reasonable N.
    - Fail fast when required selling-point context cannot be loaded or ranked.
    """

    if not isinstance(guide, dict) or not bool(guide.get("enabled", False)):
        return question_for_rag
    if selling_points_store is None:
        return question_for_rag

    stop_name = str((guide.get("stop_name") or "")).strip()
    if not stop_name:
        return question_for_rag

    try:
        duration_s = int(guide.get("duration_s") or 0)
    except Exception:
        duration_s = 0
    profile = str((guide.get("audience_profile") or "")).strip()

    try:
        n = 2 if duration_s and duration_s <= 35 else 3 if duration_s and duration_s <= 90 else 5
        if profile in ("专业", "pro", "professional"):
            n += 1
        n = max(1, min(int(n), 8))
    except Exception:
        n = 3

    pts = selling_points_store.list(stop_name=stop_name, limit=max(50, n))
    picked = selling_points_store.pick_topn(points=pts, n=n)

    if not picked:
        return question_for_rag
    lines = [f"- {p.text}" for p in picked if getattr(p, "text", None)]
    if not lines:
        return question_for_rag

    if logger is not None:
        with contextlib.suppress(Exception):
            logger.info(f"selling_points_injected stop_name={stop_name!r} n={len(lines)}")

    return f"{question_for_rag}\n\n【本展柜卖点 Top{len(lines)}】\n" + "\n".join(lines) + "\n"

