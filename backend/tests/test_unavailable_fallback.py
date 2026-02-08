from __future__ import annotations

from backend.orchestrators.ragflow_streaming import _stream_ragflow_unavailable_fallback


class _Logger:
    def __init__(self):
        self.warnings: list[str] = []
        self.infos: list[str] = []

    def warning(self, msg: str) -> None:
        self.warnings.append(str(msg))

    def info(self, msg: str) -> None:
        self.infos.append(str(msg))


class _Cancel:
    def __init__(self, is_set: bool = False):
        self._is_set = bool(is_set)

    def is_set(self) -> bool:
        return bool(self._is_set)

    def set(self) -> None:
        self._is_set = True


class _Safety:
    def __init__(self, enabled: bool = False):
        self.enabled = bool(enabled)

    def match_text(self, _t: str):
        return None


def _drain(gen):
    items = []
    try:
        while True:
            items.append(next(gen))
    except StopIteration as e:
        return items, e.value


def test_unavailable_fallback_streams_and_done_without_sleep():
    logger = _Logger()
    cancel = _Cancel(False)
    gen = _stream_ragflow_unavailable_fallback(
        request_id="r1",
        client_id="c1",
        question="Q",
        cancel_event=cancel,
        logger=logger,
        apply_qa_constraints=True,
        qa_max_answer_chars=10,
        safety_filter=_Safety(False),
        safety_block_msg="blocked",
        text_cleaner=None,
        tts_buffer=None,
        sleep_s=0.05,
        sleep_fn=lambda _s: None,
    )
    yielded, outcome = _drain(gen)
    assert yielded[-1] == {"chunk": "", "done": True}
    text = "".join(it["chunk"] for it in yielded if "chunk" in it and it["chunk"])
    assert text == outcome.answer
    assert len(outcome.answer) == 10
    assert outcome.done_sent is True


def test_unavailable_fallback_cancel_returns_without_done():
    logger = _Logger()
    cancel = _Cancel(False)

    gen = _stream_ragflow_unavailable_fallback(
        request_id="r1",
        client_id="c1",
        question="Q",
        cancel_event=cancel,
        logger=logger,
        apply_qa_constraints=False,
        qa_max_answer_chars=0,
        safety_filter=_Safety(False),
        safety_block_msg="blocked",
        text_cleaner=None,
        tts_buffer=None,
        sleep_fn=lambda _s: None,
    )

    first = next(gen)
    assert first["done"] is False
    cancel.set()

    yielded, outcome = _drain(gen)
    assert all(not (it.get("done") is True and it.get("chunk") == "") for it in yielded)
    assert outcome.cancelled is True
    assert outcome.done_sent is False
    assert outcome.save_allowed is False
