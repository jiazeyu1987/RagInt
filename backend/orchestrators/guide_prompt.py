from __future__ import annotations


def apply_guide_prompt(*, raw_question: str, guide: dict | None) -> str:
    guide = guide if isinstance(guide, dict) else {}
    if not guide.get("enabled", False):
        return raw_question

    style = str(guide.get("style") or "friendly").strip().lower()
    stop_name = str(guide.get("stop_name") or "").strip()
    is_continuous = bool(guide.get("continuous", False))
    prompt_prefix = str(guide.get("prompt_prefix") or "").strip()

    style_text = "通俗自然、亲切口语化" if style in ("friendly", "simple") else "专业准确、仍保持口播流畅"
    stop_text = f"当前展厅：{stop_name}。\n" if stop_name else ""
    continuity_text = (
        "连续讲解要求：自然承接上一段，直接进入当前展厅主题，不要寒暄，不要预告下一站。\n"
        if is_continuous
        else ""
    )

    output_constraints = (
        "输出格式要求：\n"
        "1) 只输出一整段连续讲解正文。\n"
        "2) 不要分点、不要标题、不要列表。\n"
        "3) 不要使用括号标签或特殊格式符号（如【】[]#* 等）。\n"
        '4) 不要写"第一点/第二点/总结"等结构提示词。\n'
        "5) 必须使用基础标点（，。；：！？）进行自然断句，便于 TTS 分段。\n"
        "6) 内容应可直接用于语音播报。\n"
    )

    guide_text = (
        "\n\n讲解生成要求：\n"
        "你是展厅讲解员，请根据用户问题生成口播讲解稿。\n"
        f"{stop_text}"
        f"风格：{style_text}。\n"
        f"{continuity_text}"
        f"{output_constraints}"
    )

    # 如果有前置提示词，放在最前面覆盖系统默认的导航意图
    if prompt_prefix:
        return f"{prompt_prefix}\n\n{raw_question}{guide_text}"

    return f"{raw_question}{guide_text}"
