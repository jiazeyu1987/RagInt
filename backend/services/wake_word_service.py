from __future__ import annotations

import os
import threading
import time
import unicodedata
from dataclasses import dataclass


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", str(s or "")).strip()
    if not s:
        return ""
    kept: list[str] = []
    for ch in s:
        if ch.isspace():
            continue
        cat = unicodedata.category(ch)
        if cat and cat[0] in ("P", "S", "Z"):
            continue
        kept.append(ch.casefold())
    return "".join(kept)


def parse_wake_words(raw: str | None) -> list[str]:
    if raw is None:
        return []
    items = []
    for part in str(raw).split(","):
        w = _norm(part)
        if w:
            items.append(w)
    # de-dup, keep order
    out = []
    seen = set()
    for w in items:
        if w in seen:
            continue
        seen.add(w)
        out.append(w)
    return out


def default_wake_words() -> list[str]:
    env = os.environ.get("RAGINT_WAKE_WORDS")
    if env and str(env).strip():
        return parse_wake_words(env)
    # sensible defaults (Chinese demo)
    return [w for w in parse_wake_words("你好小R,小R小R") if w]


def default_cooldown_ms() -> int:
    raw = os.environ.get("RAGINT_WAKE_WORD_COOLDOWN_MS")
    try:
        v = int(raw) if raw is not None else 5000
    except Exception:
        v = 5000
    return max(0, v)


def default_match_mode() -> str:
    mode = str(os.environ.get("RAGINT_WAKE_WORD_MATCH_MODE") or "contains").strip().lower()
    if mode in ("prefix", "contains"):
        return mode
    return "contains"


@dataclass(frozen=True)
class WakeWordResult:
    detected: bool
    wake_word: str | None
    normalized_text: str
    cooldown_ms_remaining: int
    reason: str


class WakeWordService:
    def __init__(self):
        self._lock = threading.Lock()
        self._last_trigger_ms_by_client: dict[str, int] = {}

    def detect(
        self,
        *,
        text: str,
        client_id: str,
        wake_words: list[str] | None = None,
        cooldown_ms: int | None = None,
        match_mode: str | None = None,
        now_ms: int | None = None,
    ) -> WakeWordResult:
        cid = str(client_id or "").strip()
        norm_text = _norm(text)
        if not cid or not norm_text:
            return WakeWordResult(
                detected=False,
                wake_word=None,
                normalized_text=norm_text,
                cooldown_ms_remaining=0,
                reason="invalid_input",
            )

        words = wake_words if isinstance(wake_words, list) else None
        if not words:
            words = default_wake_words()
        words = [_norm(w) for w in words if _norm(w)]

        cd = default_cooldown_ms() if cooldown_ms is None else max(0, int(cooldown_ms))
        mode = default_match_mode() if match_mode is None else str(match_mode or "").strip().lower()
        if mode not in ("prefix", "contains"):
            mode = "contains"
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        with self._lock:
            last_ms = int(self._last_trigger_ms_by_client.get(cid) or 0)
            if cd > 0 and last_ms > 0:
                remaining = (last_ms + cd) - int(now_ms)
                if remaining > 0:
                    return WakeWordResult(
                        detected=False,
                        wake_word=None,
                        normalized_text=norm_text,
                        cooldown_ms_remaining=int(remaining),
                        reason="cooldown",
                    )

            matched = None
            for w in words:
                if not w:
                    continue
                if mode == "prefix":
                    ok = norm_text.startswith(w)
                else:
                    ok = w in norm_text
                if ok:
                    matched = w
                    break

            if not matched:
                return WakeWordResult(
                    detected=False,
                    wake_word=None,
                    normalized_text=norm_text,
                    cooldown_ms_remaining=0,
                    reason="no_match",
                )

            self._last_trigger_ms_by_client[cid] = int(now_ms)
            return WakeWordResult(
                detected=True,
                wake_word=matched,
                normalized_text=norm_text,
                cooldown_ms_remaining=0,
                reason="detected",
            )
