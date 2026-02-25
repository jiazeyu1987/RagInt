from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class CandidateQuestion:
    pair_id: int
    question_text: str


@dataclass(frozen=True)
class ClassificationResult:
    match: bool
    candidate_id: int | None
    confidence: float
    reason: str
    raw_text: str


def build_classification_prompt(*, user_question: str, candidates: list[CandidateQuestion]) -> str:
    candidate_lines = []
    for c in candidates:
        candidate_lines.append(f"- id={int(c.pair_id)} | question={str(c.question_text)}")

    joined = "\n".join(candidate_lines) if candidate_lines else "- none"
    return (
        "You are a QA cache classifier.\n"
        "Task: decide whether user question can reuse one existing cached QA audio.\n"
        "Only compare semantic meaning of question intent.\n"
        "Return strict JSON only with keys: match, candidate_id, confidence, reason.\n"
        "Rules:\n"
        "- match is true or false\n"
        "- candidate_id is an integer when match=true; null otherwise\n"
        "- confidence is in [0,1]\n"
        "- no markdown, no extra text\n\n"
        f"User question:\n{user_question}\n\n"
        f"Candidate questions:\n{joined}\n"
    )


def _extract_json_text(raw_text: str) -> str:
    text = str(raw_text or "").strip()
    if not text:
        return "{}"

    # Remove fenced code markers.
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    # Find first json object region.
    l = text.find("{")
    r = text.rfind("}")
    if l >= 0 and r > l:
        return text[l : r + 1]
    return text


def parse_classifier_output(raw_text: str) -> ClassificationResult:
    cleaned = _extract_json_text(raw_text)
    try:
        data = json.loads(cleaned)
    except Exception:
        return ClassificationResult(match=False, candidate_id=None, confidence=0.0, reason="invalid_json", raw_text=str(raw_text or ""))

    match = bool(data.get("match", False))
    candidate_id = data.get("candidate_id")
    if candidate_id is None:
        cid = None
    else:
        try:
            cid = int(candidate_id)
        except Exception:
            cid = None
    try:
        confidence = float(data.get("confidence", 0.0))
    except Exception:
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))
    reason = str(data.get("reason", "") or "")
    return ClassificationResult(match=match, candidate_id=cid, confidence=confidence, reason=reason, raw_text=str(raw_text or ""))


def classify_with_ragflow(
    *,
    user_question: str,
    candidates: list[CandidateQuestion],
    ask_model: Callable[[str], str],
    threshold: float = 0.8,
) -> ClassificationResult:
    if not candidates:
        return ClassificationResult(match=False, candidate_id=None, confidence=0.0, reason="no_candidates", raw_text="")

    prompt = build_classification_prompt(user_question=user_question, candidates=candidates)
    raw = ask_model(prompt)
    parsed = parse_classifier_output(raw)

    allowed_ids = {int(c.pair_id) for c in candidates}
    if not parsed.match:
        return ClassificationResult(match=False, candidate_id=None, confidence=parsed.confidence, reason=parsed.reason or "model_reject", raw_text=parsed.raw_text)
    if parsed.candidate_id is None or parsed.candidate_id not in allowed_ids:
        return ClassificationResult(match=False, candidate_id=None, confidence=parsed.confidence, reason="invalid_candidate_id", raw_text=parsed.raw_text)
    if parsed.confidence < float(threshold):
        return ClassificationResult(match=False, candidate_id=None, confidence=parsed.confidence, reason="below_threshold", raw_text=parsed.raw_text)
    return parsed


def ragflow_ask_adapter(*, rag_session) -> Callable[[str], str]:
    """
    Adapter for ragflow session-like objects.
    Expected API: rag_session.ask(prompt, stream=False)
    """

    def _ask(prompt: str) -> str:
        resp = rag_session.ask(prompt, stream=False)
        if isinstance(resp, str):
            return resp
        if isinstance(resp, dict):
            for key in ("answer", "content", "text"):
                if key in resp:
                    return str(resp.get(key) or "")
        return str(resp)

    return _ask

