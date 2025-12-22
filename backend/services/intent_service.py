from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IntentResult:
    intent: str
    confidence: float
    matched: tuple[str, ...] = ()
    reason: str = ""


class IntentService:
    """
    Lightweight (rule-based) Chinese intent classifier for exhibit-hall scenarios.
    Intents:
      - qa: default Q&A
      - guide: request for explanation / guided tour
      - direction: wayfinding / location / navigation
      - chitchat: greetings / thanks / casual chat
      - complaint: complaints / negative feedback / escalation
    """

    def __init__(self):
        self._rules: list[tuple[str, tuple[str, ...], float]] = [
            (
                "complaint",
                (
                    "投诉",
                    "不满意",
                    "差评",
                    "太差",
                    "垃圾",
                    "骗人",
                    "骗子",
                    "退钱",
                    "退款",
                    "售后",
                    "举报",
                    "生气",
                    "态度差",
                    "服务差",
                ),
                0.92,
            ),
            (
                "direction",
                (
                    "怎么走",
                    "怎么去",
                    "在哪",
                    "位置",
                    "路线",
                    "导航",
                    "地图",
                    "指路",
                    "厕所",
                    "洗手间",
                    "卫生间",
                    "出口",
                    "入口",
                    "电梯",
                    "楼梯",
                    "前台",
                    "服务台",
                    "充电",
                    "停车",
                ),
                0.84,
            ),
            (
                "guide",
                (
                    "讲解",
                    "介绍",
                    "参观",
                    "带我",
                    "导览",
                    "展区",
                    "展位",
                    "下一站",
                    "继续讲解",
                    "开始讲解",
                    "讲一讲",
                    "讲一下",
                    "解说",
                ),
                0.78,
            ),
            (
                "chitchat",
                (
                    "你好",
                    "您好",
                    "hi",
                    "hello",
                    "在吗",
                    "谢谢",
                    "谢了",
                    "再见",
                    "拜拜",
                    "哈哈",
                    "厉害",
                    "牛",
                    "你是谁",
                    "你叫什么",
                ),
                0.72,
            ),
        ]

    def classify(self, text: str) -> IntentResult:
        q = str(text or "").strip()
        if not q:
            return IntentResult(intent="qa", confidence=0.0, matched=(), reason="empty")

        lowered = q.lower()
        matched_best: tuple[str, ...] = ()
        best: IntentResult | None = None
        for intent, keywords, base_conf in self._rules:
            hits = tuple(k for k in keywords if (k.lower() in lowered))
            if not hits:
                continue
            # More hits => higher confidence (bounded).
            conf = min(0.99, base_conf + 0.04 * max(0, len(hits) - 1))
            if best is None or conf > best.confidence:
                matched_best = hits
                best = IntentResult(intent=intent, confidence=conf, matched=hits, reason="keyword_match")

        if best is not None:
            # Small disambiguation: pure greetings are chitchat.
            if best.intent != "chitchat" and any(x in lowered for x in ("你好", "您好", "hi", "hello")) and len(q) <= 8:
                return IntentResult(intent="chitchat", confidence=0.75, matched=("greeting",), reason="short_greeting")
            return best

        # Heuristic: very short questions are likely chitchat.
        if len(q) <= 3 and q in ("嗯", "啊", "哦", "哈", "？", "?"):
            return IntentResult(intent="chitchat", confidence=0.55, matched=(q,), reason="short_interjection")

        return IntentResult(intent="qa", confidence=0.45, matched=matched_best, reason="default")

