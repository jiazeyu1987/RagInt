from __future__ import annotations

from backend.orchestrators.conversation_orchestrator import ConversationOrchestrator


class _Logger:
    def __init__(self):
        self.warns: list[str] = []

    def warning(self, msg: str) -> None:
        self.warns.append(str(msg))


class _Safety:
    def __init__(self, enabled: bool, term: str | None):
        self.enabled = bool(enabled)
        self._term = term

    def match_text(self, _text: str):
        return self._term


def _drain(gen):
    items = []
    try:
        while True:
            items.append(next(gen))
    except StopIteration as e:
        return items, e.value


def _mk_orchestrator(logger):
    return ConversationOrchestrator(
        ragflow_service=object(),
        ragflow_agent_service=object(),
        intent_service=object(),
        history_store=object(),
        logger=logger,
        timings_set=lambda *_a, **_k: None,
        timings_get=lambda *_a, **_k: {},
        default_session=None,
    )


def test_maybe_block_input_emits_block_payload_and_returns_true():
    logger = _Logger()
    orch = _mk_orchestrator(logger)

    gen = orch._maybe_block_input(
        request_id="r1",
        question="敏感词",
        safety_filter=_Safety(True, "敏感词"),
        safety_block_msg="抱歉，无法回答",
    )
    yielded, blocked = _drain(gen)

    assert blocked is True
    assert yielded[0]["done"] is False
    assert yielded[0]["chunk"] == "抱歉，无法回答"
    assert yielded[1]["done"] is True
    assert logger.warns and "safety_block_input" in logger.warns[0]


def test_maybe_block_input_returns_false_when_not_matched():
    logger = _Logger()
    orch = _mk_orchestrator(logger)

    gen = orch._maybe_block_input(
        request_id="r1",
        question="普通问题",
        safety_filter=_Safety(True, None),
        safety_block_msg="抱歉，无法回答",
    )
    yielded, blocked = _drain(gen)

    assert yielded == []
    assert blocked is False
    assert logger.warns == []
