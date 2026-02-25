from __future__ import annotations


def detect_intent_and_meta(*, intent_service, question: str, request_id: str, client_id: str, kind: str, logger):
    intent = intent_service.classify(question)
    logger.info(
        f"[{request_id}] intent_detected intent={intent.intent} conf={intent.confidence:.2f} matched={list(intent.matched)} reason={intent.reason}"
    )
    meta = {
        "intent": intent.intent,
        "intent_confidence": round(float(intent.confidence), 3),
        "intent_matched": list(intent.matched),
        "intent_reason": intent.reason,
        "client_id": client_id,
        "kind": kind,
    }
    return intent, meta
