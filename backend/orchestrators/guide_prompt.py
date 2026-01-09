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
    duration_s = max(15, min(duration_s, 3600))

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

    # Content hierarchy / structured output template.
    if duration_s <= 35:
        structure_text = (
            "- 输出结构（严格按顺序）：\n"
            "  1) 【30秒概览】2–3 句：一句定义/一句亮点/一句场景或价值。\n"
            "  2) 【重点产品/卖点】列 2–3 条项目符号（每条 <= 18 字），优先“可感知”的指标或效果。\n"
            "  3) 【互动引导】1 句反问或选择题，引导继续参观/提问。\n"
        )
    elif duration_s <= 90:
        structure_text = (
            "- 输出结构（严格按顺序）：\n"
            "  1) 【30秒概览】3–4 句：先概括，再点出 2 个关键亮点。\n"
            "  2) 【重点产品/卖点】列 3 条项目符号：每条“产品/点 + 一句话价值”。\n"
            "  3) 【补充细节】2–3 句：给出一个例子/对比/使用场景。\n"
            "  4) 【互动引导】1 句引导继续/提问。\n"
        )
    else:
        structure_text = (
            "- 输出结构（严格按顺序）：\n"
            "  1) 【30秒概览】4–5 句：从“是什么/解决什么”切入。\n"
            "  2) 【重点产品/卖点】列 3–5 条项目符号：按重要性排序。\n"
            "  3) 【深入讲解】分 2–3 段：每段先结论后解释，避免大段口水话。\n"
            "  4) 【常见问答】1–2 组：每组 1 句问 + 1 句答（可选）。\n"
            "  5) 【互动引导】1 句收束，引导下一步。\n"
        )
    guide_text = (
        "【展厅讲解要求】\n"
        "你是一名展厅讲解员，面向来访者做中文讲解。\n"
        f"{stop_text}"
        f"- 讲解风格：{style_text}\n"
        f"- 时长：{length_text}\n"
        f"{target_text}"
        f"{structure_text}"
        f"{continuity_text}"
        "- 输出：用短句分段（便于语音播报），必要时用项目符号。\n"
        "- 约束：不要编造；如果知识库上下文没有依据，请明确说明不确定，并建议咨询现场工作人员。\n"
    )
    return f"{raw_question}\n\n{guide_text}"
