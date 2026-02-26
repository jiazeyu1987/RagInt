from __future__ import annotations

import re
import unicodedata


_TRIM_PUNCT = " \t\r\n.,!?;:\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001"
_TRAILING_PUNCT_RE = re.compile(r"[\.!?,;:\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001~\uFF5E\u2026]+$")
_TRAILING_MODAL_RE = re.compile(r"(?:\u5417|\u561b|\u5462|\u5440|\u554a|\u5427)+$")


def normalize_question(text: str) -> str:
    """
    Generic normalization used by cache key generation for all question types.
    No domain-specific (e.g. math-only) branches.
    """
    s = unicodedata.normalize("NFKC", str(text or ""))
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = s.strip(_TRIM_PUNCT)

    # Remove generic trailing punctuation / modal particles.
    while s:
        prev = s
        s = _TRAILING_PUNCT_RE.sub("", s).strip(_TRIM_PUNCT)
        s = _TRAILING_MODAL_RE.sub("", s).strip(_TRIM_PUNCT)
        if s == prev:
            break

    return s
