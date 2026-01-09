from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class TourCommand:
    intent: str  # tour_command | none
    action: str  # next|prev|jump|start|continue|pause|resume|restart
    confidence: float
    stop_index: int | None = None
    stop_name: str | None = None
    reason: str = ""


_RE_INT = re.compile(r"(?P<n>\d+)")
_RE_JUMP_NUM = re.compile(r"(跳到|跳转到|到|去)\s*(第)?\s*(?P<n>\d+)\s*(站|个)?", re.IGNORECASE)
_RE_STOP_NAMED = re.compile(r"(去|到|跳到|跳转到)\s*(?P<name>.+)$", re.IGNORECASE)


def _norm(s: str) -> str:
    return str(s or "").strip().lower()


class TourCommandService:
    def parse(self, *, text: str, stops: list[str] | None = None) -> TourCommand:
        q = _norm(text)
        if not q:
            return TourCommand(intent="none", action="", confidence=0.0, reason="empty")

        # Pause / resume.
        if any(k in q for k in ("暂停", "停一下", "先停", "停止讲解", "暂停讲解")):
            return TourCommand(intent="tour_command", action="pause", confidence=0.9, reason="keyword_pause")
        if any(k in q for k in ("继续", "恢复", "接着讲", "继续讲解", "恢复讲解")):
            # Note: "继续" can also mean "下一站" in some contexts; we keep it explicit.
            return TourCommand(intent="tour_command", action="resume", confidence=0.78, reason="keyword_resume")

        # Start / restart.
        if any(k in q for k in ("开始讲解", "开始导览", "开始参观")):
            return TourCommand(intent="tour_command", action="start", confidence=0.82, reason="keyword_start")
        if any(k in q for k in ("重来", "重新开始", "从头开始", "从头讲")):
            return TourCommand(intent="tour_command", action="restart", confidence=0.86, reason="keyword_restart")

        # Next / prev.
        if any(k in q for k in ("下一站", "下一个", "下一", "下站")):
            return TourCommand(intent="tour_command", action="next", confidence=0.86, reason="keyword_next")
        if any(k in q for k in ("上一站", "上一个", "上一", "上站")):
            return TourCommand(intent="tour_command", action="prev", confidence=0.86, reason="keyword_prev")

        # Jump to numeric stop index (1-based in speech).
        m = _RE_JUMP_NUM.search(q)
        if m:
            try:
                n = int(m.group("n"))
            except Exception:
                n = 0
            if n > 0:
                return TourCommand(intent="tour_command", action="jump", confidence=0.84, stop_index=n - 1, reason="jump_num")

        # Jump to stop by name (best-effort substring match).
        m = _RE_STOP_NAMED.search(q)
        if m:
            name = str(m.group("name") or "").strip()
            if name:
                ss = [str(s or "").strip() for s in (stops or []) if str(s or "").strip()]
                if ss:
                    # exact/substring match
                    for i, s in enumerate(ss):
                        if name == s or name in s or s in name:
                            return TourCommand(
                                intent="tour_command",
                                action="jump",
                                confidence=0.78,
                                stop_index=i,
                                stop_name=s,
                                reason="jump_name",
                            )
                return TourCommand(intent="tour_command", action="jump", confidence=0.6, stop_name=name, reason="jump_name_unresolved")

        return TourCommand(intent="none", action="", confidence=0.25, reason="no_match")

