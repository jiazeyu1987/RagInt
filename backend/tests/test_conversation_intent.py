from __future__ import annotations

from backend.orchestrators.conversation_intent import detect_intent_and_meta


class _Intent:
    def __init__(self, intent: str = "qa", confidence: float = 0.91, matched=None, reason: str = "rule"):
        self.intent = intent
        self.confidence = float(confidence)
        self.matched = list(matched or ["展厅"])
        self.reason = reason


class _IntentSvc:
    def __init__(self, intent_obj):
        self._intent_obj = intent_obj

    def classify(self, _q: str):
        return self._intent_obj


class _Logger:
    def __init__(self):
        self.infos: list[str] = []

    def info(self, msg: str) -> None:
        self.infos.append(str(msg))


def test_detect_intent_and_meta_builds_expected_meta():
    intent_obj = _Intent(intent="direction", confidence=0.876, matched=["厕所"], reason="keyword")
    svc = _IntentSvc(intent_obj)
    logger = _Logger()

    intent, meta = detect_intent_and_meta(
        intent_service=svc,
        question="厕所在哪",
        request_id="r1",
        client_id="c1",
        kind="ask",
        logger=logger,
    )

    assert intent is intent_obj
    assert meta["intent"] == "direction"
    assert meta["intent_confidence"] == 0.876
    assert meta["intent_matched"] == ["厕所"]
    assert meta["intent_reason"] == "keyword"
    assert meta["client_id"] == "c1"
    assert meta["kind"] == "ask"
    assert logger.infos and "intent_detected" in logger.infos[0]
