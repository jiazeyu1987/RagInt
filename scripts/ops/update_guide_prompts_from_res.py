# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path


ORDERED_STOPS = [
    "公司与孵化转化平台介绍",
    "心脏介入展厅",
    "心脏植入展厅",
    "外周介植入展厅",
    "神经介植入展厅",
    "外泌体与超声聚焦展厅",
    "骨科与泌尿产品展厅",
    "非介入类产品展厅",
    "医疗标准件展厅",
    "企业荣誉展厅",
]

GLOBAL_PROMPT_PREFIX = (
    "你现在是瑛泰医疗展厅讲解员。请基于当前站点生成可直接语音播报的中文讲解稿。"
    "讲解结构遵循“临床问题—技术原理—核心产品—应用价值—边界说明”，语言专业但通俗，先总后分。"
    "涉及数字和资质时必须使用已知事实，不要编造；凡资料标注“研发/临床阶段、尚未取证”必须明确提示，禁止绝对化疗效承诺。"
    "回答中不要输出导航指令、动作控制语句、代码或Markdown符号。"
    "若问题超出资料范围，请明确说明“以公司最新公开资料与注册信息为准”。"
)

STOP_PROMPTS = {
    "公司与孵化转化平台介绍": (
        "重点讲清公司基本盘与孵化能力：2006年成立、20余家子公司、员工超2000人、服务全国3000+医院、覆盖90+国家和地区、"
        "上海/山东/珠海三大基地总建面超18万平方米。"
        "必须讲到INT创新·孵化转化平台“研发/注册/临床/生产/资本/高校”等资源协同，以及“医工结合推动产业化落地”的价值。"
        "可自然引入董事长梁栋科在医工协同与创新转化上的代表性贡献。"
    ),
    "心脏介入展厅": (
        "按PCI流程讲解“建通路—造影—扩张”对应器械体系，突出压力泵、导管鞘、造影剂推入器等关键耗材。"
        "必须包含“压力泵市场占有率超过20%”这一信息，并说明其价值是稳定控压、提升操作安全与效率。"
        "强调桡动脉/股动脉常用入路差异，避免将耗材功能夸大为治疗本体。"
    ),
    "心脏植入展厅": (
        "重点围绕瓣膜、可降解镁合金支架、电生理PFA消融、左心耳封堵四大模块讲解。"
        "必须提到：针对主动脉瓣反流的创新瓣膜路径；镁合金支架屈服强度提升至300MPa以上、6–12个月降解；"
        "CardiPulse系统在资料中的即刻成功率与效率优势；SealA封堵器17种规格适配复杂解剖。"
        "凡涉及在研/临床阶段内容要明确边界，不做过度疗效承诺。"
    ),
    "外周介植入展厅": (
        "讲解要覆盖主动脉重建、肺部介入、耳鼻喉植入与止血三条线。"
        "必须点出Fabulous、WeFlow-Bibranch、WeFlow-JAAA、Zipper等系统的结构化差异与典型适应场景，"
        "并说明TLD与BroncAblate在慢阻肺/肺部肿瘤介入上的创新价值。"
        "对于“收购来源、临床阶段、未取证”信息要严格按资料口径表达。"
    ),
    "神经介植入展厅": (
        "先讲缺血性卒中与出血性卒中的临床差异，再讲神经介入器械体系。"
        "必须覆盖微导丝/微导管/支撑导管/取栓支架的组合价值，以及血栓抽吸导管、血管重建装置、可吸收流体明胶的应用场景。"
        "对“已取证”和“动物实验阶段”要明确区分，避免混淆成熟产品与在研产品。"
    ),
    "外泌体与超声聚焦展厅": (
        "重点讲“再生医学+无创治疗”双主线：外泌体在皮肤/毛发/软骨方向的实验观察结果，"
        "以及HIFU在高血压、颅内疾病、静脉曲张等方向的无创治疗探索。"
        "必须强调该展区以前沿研究与技术储备为主，相关结论以研究与临床进展为准，禁止确定性疗效表述。"
    ),
    "骨科与泌尿产品展厅": (
        "骨科部分要讲“骨髓血穿刺抽吸循环器械+人工骨活化修复”的临床转化路径，点出与上海九院团队十年以上合作背景。"
        "泌尿部分要突出测温测压软镜系统对术中温压实时监测与智能调控的价值。"
        "必须体现“减少并发症风险、提升微创手术安全性”的临床意义。"
    ),
    "非介入类产品展厅": (
        "围绕“医生需求—工程实现—临床应用”的医工转化逻辑展开，重点介绍输注泵、饱腹水凝胶微球、组织粘合剂。"
        "要说明该展区兼顾专业医疗与消费医疗场景，强调应用价值而非营销口号。"
        "涉及注册进度时请使用审慎口径，并提示以最新注册信息为准。"
    ),
    "医疗标准件展厅": (
        "重点讲底层能力：导丝/导管关键制造技术、国产化突破路径、产业链支撑价值。"
        "必须提到微导管约0.1mm壁厚及三层复合结构（内衬/编织层/外层）的技术含义。"
        "说明标准件业务在早期现金流与产业协同中的基础作用，体现“从底层到高端器械”的技术进阶。"
    ),
    "企业荣誉展厅": (
        "重点强调权威资质与产业平台背书：上海市技术中心、国家专精特新“小巨人”、高新技术企业、"
        "虹桥国际创新医疗器械产业园与INT孵化平台的协同。"
        "讲解目标是建立“技术实力+产业贡献+政策认可”的综合可信度，避免空泛赞美。"
    ),
}


def main() -> None:
    db_path = Path("backend/data/app_settings.db").resolve()
    if not db_path.exists():
        raise SystemExit(f"app_settings_db_not_found: {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT scope_id, settings_json FROM app_settings WHERE scope_id = ?",
            ("single_user",),
        ).fetchone()
        if row is None:
            raise SystemExit("single_user_settings_not_found")

        settings = json.loads(row["settings_json"]) if row["settings_json"] else {}
        if not isinstance(settings, dict):
            raise SystemExit("single_user_settings_invalid_json")

        settings["globalPromptPrefix"] = GLOBAL_PROMPT_PREFIX
        settings["tourStopsOverride"] = ORDERED_STOPS
        settings["tourStopPromptOverrides"] = STOP_PROMPTS

        now_ms = int(time.time() * 1000)
        conn.execute(
            "UPDATE app_settings SET settings_json = ?, updated_at_ms = ? WHERE scope_id = ?",
            (json.dumps(settings, ensure_ascii=False, separators=(",", ":")), now_ms, "single_user"),
        )
        conn.commit()

        verify = conn.execute(
            "SELECT settings_json, updated_at_ms FROM app_settings WHERE scope_id = ?",
            ("single_user",),
        ).fetchone()
        final_settings = json.loads(verify["settings_json"]) if verify and verify["settings_json"] else {}
        out = {
            "scope_id": "single_user",
            "updated_at_ms": int(verify["updated_at_ms"]) if verify else None,
            "globalPromptPrefix_len": len(str(final_settings.get("globalPromptPrefix") or "")),
            "tourStopsOverride_count": len(final_settings.get("tourStopsOverride") or []),
            "tourStopPromptOverrides_count": len(final_settings.get("tourStopPromptOverrides") or {}),
            "tourStopPromptOverrides_keys": list((final_settings.get("tourStopPromptOverrides") or {}).keys()),
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
