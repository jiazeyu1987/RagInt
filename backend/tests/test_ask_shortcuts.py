from __future__ import annotations

from backend.orchestrators.ask_shortcuts import _maybe_stream_fast_intent


class _Intent:
    def __init__(self, intent: str, confidence: float):
        self.intent = intent
        self.confidence = confidence


class _Logger:
    def __init__(self):
        self.warns: list[str] = []

    def warning(self, msg: str) -> None:
        self.warns.append(str(msg))


class _Safety:
    enabled = False

    def match_text(self, _text: str):
        return None


def _drain(gen):
    items = []
    try:
        while True:
            items.append(next(gen))
    except StopIteration as exc:
        return items, exc.value


def test_fast_intent_direction_shortcut_disabled():
    logger = _Logger()
    gen = _maybe_stream_fast_intent(
        request_id="r1",
        intent=_Intent("direction", 0.95),
        apply_qa_constraints=False,
        qa_max_answer_chars=200,
        safety_filter=_Safety(),
        safety_block_msg="blocked",
        logger=logger,
    )

    yielded, outcome = _drain(gen)

    assert yielded == []
    assert outcome is None
    assert logger.warns == []


def test_fast_intent_chitchat_shortcut_still_enabled():
    logger = _Logger()
    gen = _maybe_stream_fast_intent(
        request_id="r2",
        intent=_Intent("chitchat", 0.95),
        apply_qa_constraints=False,
        qa_max_answer_chars=200,
        safety_filter=_Safety(),
        safety_block_msg="blocked",
        logger=logger,
    )

    yielded, outcome = _drain(gen)

    assert len(yielded) == 2
    assert yielded[0]["done"] is False
    assert yielded[1]["done"] is True
    assert outcome is not None
