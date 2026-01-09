from __future__ import annotations


def apply_guide_prompt(*, raw_question: str, guide: dict | None) -> str:
    guide = guide if isinstance(guide, dict) else {}
    if not guide.get("enabled", False):
        return raw_question

    style = str(guide.get("style") or "friendly").strip().lower()
    stop_name = str(guide.get("stop_name") or "").strip()
    is_continuous = bool(guide.get("continuous", False))
    try:
        target_chars = int(guide.get("target_chars") or 0)
    except Exception:
        target_chars = 0
    try:
        duration_s = int(guide.get("duration_s") or 60)
    except Exception:
        duration_s = 60
    duration_s = max(15, min(duration_s, 600))

    style_text = "通俗易懂、亲切自然" if style in ("friendly", "simple") else "更专业、术语更准确"
    if duration_s <= 35:
        length_text = "控制在约30秒内，简洁但信息密度高"
    elif duration_s <= 90:
        length_text = "控制在约1分钟内，结构清晰"
    else:
        length_text = "控制在约3分钟内，分段讲解，循序渐进"

    target_text = f"- 建议总字数：约{target_chars}字（按语速估算）\n" if target_chars > 0 else ""
    stop_text = f"- 当前展厅：{stop_name}\n" if stop_name else ""
    continuity_text = (
        "- 衔接（连续讲解）：\n"
        "  - 开头不要重复寒暄欢迎词（如“欢迎来到/接下来我们来/让我们来到”）。\n"
        "  - 语句自然承接上一段，再直接进入本站主题。\n"
        "  - 结尾不要预告下一站（除非用户明确要求）。\n"
    ) if is_continuous else ""
    guide_text = (
        "【展厅讲解要求】\n"
        "你是一名展厅讲解员，面向来访者做中文讲解。\n"
        f"{stop_text}"
        f"- 讲解风格：{style_text}\n"
        f"- 时长：{length_text}\n"
        f"{target_text}"
        f"{continuity_text}"
        "- 输出：用短句分段（便于语音播报），必要时用项目符号。\n"
        "- 约束：不要编造；如果知识库上下文没有依据，请明确说明不确定，并建议咨询现场工作人员。\n"
    )
    return f"{raw_question}\n\n{guide_text}"

