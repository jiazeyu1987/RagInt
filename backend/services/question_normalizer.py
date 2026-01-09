from __future__ import annotations

import re
import unicodedata


_TRIM_PUNCT = " \t\r\n.,!?;:，。！？；：、"


def normalize_question(text: str) -> str:
    s = unicodedata.normalize("NFKC", str(text or ""))
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = s.strip(_TRIM_PUNCT)
    return s

