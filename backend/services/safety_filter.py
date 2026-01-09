from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


_WS_RE = re.compile(r"\s+", flags=re.UNICODE)


def _normalize_text(text: str) -> str:
    s = unicodedata.normalize("NFKC", str(text or ""))
    s = s.lower()
    s = _WS_RE.sub("", s)
    return s


def _parse_terms(raw) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        out = []
        for x in raw:
            x = str(x or "").strip()
            if x:
                out.append(x)
        return out

    s = str(raw or "").strip()
    if not s:
        return []
    # Accept comma/semicolon/newline separated lists.
    parts = re.split(r"[,;\n\r]+", s)
    return [p.strip() for p in parts if p and p.strip()]


@dataclass(frozen=True)
class SensitiveWordsFilter:
    """
    Best-effort blacklist matcher for input/output text.

    - Normalizes by NFKC + lowercase + removing whitespace.
    - Designed for fast substring checks; does not attempt complex tokenization.
    """

    _terms: tuple[str, ...]
    _norm_terms: tuple[tuple[str, str], ...]  # (normalized, original)
    _window_len: int

    @classmethod
    def from_config(cls, cfg: dict | None) -> "SensitiveWordsFilter":
        cfg = cfg if isinstance(cfg, dict) else {}
        safety = cfg.get("safety") if isinstance(cfg.get("safety"), dict) else {}
        raw = None
        if isinstance(safety, dict) and "blacklist" in safety:
            raw = safety.get("blacklist")
        elif "sensitive_words" in cfg:
            raw = cfg.get("sensitive_words")
        elif "blacklist" in cfg:
            raw = cfg.get("blacklist")

        terms = _parse_terms(raw)
        uniq: list[str] = []
        seen = set()
        for t in terms:
            if t in seen:
                continue
            seen.add(t)
            uniq.append(t)
        uniq = uniq[:200]

        norm_pairs: list[tuple[str, str]] = []
        max_len = 0
        for t in uniq:
            n = _normalize_text(t)
            if not n:
                continue
            max_len = max(max_len, len(n))
            norm_pairs.append((n, t))

        norm_pairs.sort(key=lambda x: len(x[0]), reverse=True)
        window_len = max(200, min(2000, max_len * 4 if max_len else 200))
        return cls(_terms=tuple(uniq), _norm_terms=tuple(norm_pairs), _window_len=int(window_len))

    @property
    def enabled(self) -> bool:
        return bool(self._norm_terms)

    def match_text(self, text: str) -> str | None:
        if not self._norm_terms:
            return None
        norm = _normalize_text(text)
        if not norm:
            return None
        for n, orig in self._norm_terms:
            if n and n in norm:
                return orig
        return None

    def update_stream_tail_and_match(self, *, tail_norm: str, new_text: str) -> tuple[str | None, str]:
        """
        Maintain a normalized tail buffer to allow matching across chunk boundaries.
        Returns: (matched_original_term_or_none, new_tail_norm)
        """
        if not self._norm_terms:
            return None, str(tail_norm or "")
        tail_norm = str(tail_norm or "")
        new_norm = _normalize_text(new_text)
        if not new_norm and tail_norm:
            # Nothing new; keep bounded.
            return None, tail_norm[-self._window_len :]
        combined = (tail_norm + new_norm)[-self._window_len :]
        for n, orig in self._norm_terms:
            if n and n in combined:
                return orig, combined
        return None, combined

