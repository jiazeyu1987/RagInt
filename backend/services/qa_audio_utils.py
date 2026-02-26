from __future__ import annotations

import ast
import contextlib
import hashlib
import json
import re

import numpy as np

from backend.services.question_normalizer import normalize_question


DEFAULT_CORE_ENTITY_TERMS: tuple[str, ...] = (
    "导丝",
    "导管",
    "支架",
    "球囊",
    "导鞘",
    "鞘管",
    "压力泵",
    "推注器",
    "推入器",
    "瓣膜",
    "封堵器",
    "起搏器",
    "电极",
    "器械",
    "设备",
    "系统",
    "平台",
    "模块",
    "软件",
    "算法",
    "模型",
    "芯片",
    "传感器",
    "电机",
    "电池",
    "试剂",
    "药物",
    "耗材",
)


def embed_question(text: str, *, dim: int = 512) -> np.ndarray:
    s = str(text or "").strip().lower()
    v = np.zeros((int(dim),), dtype=np.float32)
    if not s:
        return v
    for n in (1, 2, 3):
        if len(s) < n:
            continue
        for i in range(0, len(s) - n + 1):
            gram = s[i : i + n]
            digest = hashlib.blake2b(f"{n}:{gram}".encode("utf-8"), digest_size=8).digest()
            h = int.from_bytes(digest, byteorder="little", signed=False)
            idx = h % dim
            sign = 1.0 if (h & 1) == 0 else -1.0
            v[idx] += sign
    norm = float(np.linalg.norm(v))
    if norm > 1e-12:
        v /= norm
    return v


def char_ngrams(text: str, n: int) -> set[str]:
    s = str(text or "")
    if not s:
        return set()
    if n <= 1:
        return set(s)
    if len(s) < n:
        return {s}
    return {s[i : i + n] for i in range(0, len(s) - n + 1)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a.intersection(b))
    union = len(a.union(b))
    if union <= 0:
        return 0.0
    return float(inter / union)


def lexical_similarity(a: str, b: str) -> float:
    qa = normalize_question(a)
    qb = normalize_question(b)
    if not qa or not qb:
        return 0.0
    if qa == qb:
        return 1.0
    if qa in qb or qb in qa:
        short = min(len(qa), len(qb))
        long = max(len(qa), len(qb))
        ratio = float(short / long) if long > 0 else 0.0
        return max(0.86, min(1.0, ratio))

    uni = jaccard(char_ngrams(qa, 1), char_ngrams(qb, 1))
    bi = jaccard(char_ngrams(qa, 2), char_ngrams(qb, 2))
    tri = jaccard(char_ngrams(qa, 3), char_ngrams(qb, 3))
    blended = (uni * 0.35) + (bi * 0.45) + (tri * 0.20)
    return max(0.0, min(1.0, float(blended)))


def extract_core_terms(text: str, *, core_terms: tuple[str, ...]) -> set[str]:
    s = normalize_question(text)
    if not s:
        return set()
    out: set[str] = set()
    for t in core_terms:
        if t and t in s:
            out.add(t)
    return out


def detect_entity_conflict(
    *,
    query: str,
    candidate: str,
    core_terms: tuple[str, ...],
) -> tuple[bool, list[str], list[str]]:
    q_terms = extract_core_terms(query, core_terms=core_terms)
    c_terms = extract_core_terms(candidate, core_terms=core_terms)
    if q_terms and c_terms and q_terms.isdisjoint(c_terms):
        return True, sorted(q_terms), sorted(c_terms)
    return False, sorted(q_terms), sorted(c_terms)


def sanitize_classifier_text(raw_text: str) -> str:
    txt = str(raw_text or "").strip()
    if not txt:
        return ""
    txt = re.sub(r"<think\b[^>]*>.*?</think>", "", txt, flags=re.IGNORECASE | re.DOTALL)
    txt = re.sub(r"</?think\b[^>]*>", "", txt, flags=re.IGNORECASE)
    txt = re.sub(r"```(?:json)?", "", txt, flags=re.IGNORECASE)
    return txt.strip()


def extract_json(raw_text: str) -> str:
    txt = sanitize_classifier_text(raw_text)
    if not txt:
        return "{}"
    l = txt.find("{")
    r = txt.rfind("}")
    if l >= 0 and r > l:
        return txt[l : r + 1]
    return txt


def try_parse_json_like(raw_text: str) -> dict | None:
    txt = str(raw_text or "").strip()
    if not txt:
        return None
    with contextlib.suppress(Exception):
        parsed = json.loads(txt)
        if isinstance(parsed, dict):
            return parsed
    with contextlib.suppress(Exception):
        parsed = ast.literal_eval(txt)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, str):
            parsed2 = json.loads(extract_json(parsed))
            if isinstance(parsed2, dict):
                return parsed2
    return None


def extract_json_objects(raw_text: str) -> list[str]:
    txt = sanitize_classifier_text(raw_text)
    objs: list[str] = []
    depth = 0
    start = -1
    for idx, ch in enumerate(txt):
        if ch == "{":
            if depth == 0:
                start = idx
            depth += 1
            continue
        if ch == "}":
            if depth <= 0:
                continue
            depth -= 1
            if depth == 0 and start >= 0:
                objs.append(txt[start : idx + 1])
                start = -1
    return objs


def parse_classification(raw_text: str) -> dict:
    empty = {"match": False, "candidate_id": None, "confidence": 0.0, "reason": "invalid_json"}
    raw_txt = sanitize_classifier_text(raw_text)
    if not raw_txt:
        return empty
    data = try_parse_json_like(extract_json(raw_txt))
    if data is None:
        data = try_parse_json_like(raw_txt)
    if data is None:
        for candidate in reversed(extract_json_objects(raw_txt)):
            data = try_parse_json_like(candidate)
            if data is not None:
                break
    if data is None:
        return empty

    try:
        confidence = float(data.get("confidence", 0.0))
    except Exception:
        confidence = 0.0
    confidence = max(0.0, min(confidence, 1.0))

    cid = data.get("candidate_id")
    try:
        cid = int(cid) if cid is not None else None
    except Exception:
        cid = None

    return {
        "match": bool(data.get("match", False)),
        "candidate_id": cid,
        "confidence": confidence,
        "reason": str(data.get("reason", "") or ""),
    }


def compact_debug_raw(raw_text: str, *, head: int = 2000, tail: int = 2000) -> tuple[str, bool]:
    txt = str(raw_text or "")
    limit = max(0, int(head)) + max(0, int(tail))
    if len(txt) <= limit or limit <= 0:
        return txt, False
    return f"{txt[:head]}\n...[TRUNCATED]...\n{txt[-tail:]}", True
