from __future__ import annotations

from backend.orchestrators.ragflow_streaming import RagflowStreamSettings, _stream_ragflow_response


class _Logger:
    def __init__(self):
        self.infos: list[str] = []
        self.warnings: list[str] = []
        self.errors: list[str] = []

    def info(self, msg: str) -> None:
        self.infos.append(str(msg))

    def warning(self, msg: str) -> None:
        self.warnings.append(str(msg))

    def error(self, msg: str, exc_info: bool = False) -> None:  # noqa: ARG002
        self.errors.append(str(msg))


class _Cancel:
    def __init__(self, is_set: bool = False):
        self._is_set = bool(is_set)

    def is_set(self) -> bool:
        return bool(self._is_set)

    def set(self) -> None:
        self._is_set = True


class _Chunk:
    def __init__(self, content: str):
        self.content = str(content)


class _Resp:
    def __init__(self, chunks: list[_Chunk]):
        self._chunks = list(chunks)
        self.closed = False

    def __iter__(self):
        yield from self._chunks

    def close(self) -> None:
        self.closed = True


class _Session:
    def __init__(self, resp: _Resp):
        self._resp = resp

    def ask(self, _q: str, stream: bool = True):  # noqa: ARG002
        return self._resp


class _Safety:
    enabled = False


def _drain(gen):
    items = []
    try:
        while True:
            items.append(next(gen))
    except StopIteration as e:
        return items, e.value


def test_stream_ragflow_response_happy_path_returns_cache_put_allowed():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_Chunk("H"), _Chunk("He"), _Chunk("Hello")])
    session = _Session(resp)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r1",
        client_id="c1",
        agent_id="",
        question_for_rag="q",
        rag_session=session,
        ragflow_agent_service=None,
        cancel_event=cancel,
        t_submit=0.0,
        logger=logger,
        timings_set=timings_set,
        settings=RagflowStreamSettings(
            apply_qa_constraints=False,
            qa_no_self_intro=False,
            qa_max_answer_chars=0,
            safety_filter=_Safety(),
            safety_block_msg="blocked",
            enable_cleaning=False,
            text_cleaner=None,
            tts_buffer=None,
            start_tts_on_first_chunk=False,
            first_segment_min_chars=1,
            segment_flush_interval_s=0.8,
            segment_min_chars=3,
        ),
    )

    yielded, outcome = _drain(gen)
    chunks = [it["chunk"] for it in yielded if "chunk" in it]
    assert chunks == ["H", "e", "llo", ""]
    assert outcome.answer == "Hello"
    assert outcome.cancelled is False
    assert outcome.save_allowed is True
    assert outcome.cache_put_allowed is True


def test_stream_ragflow_response_cancel_does_not_emit_done_and_disables_save():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_Chunk("H"), _Chunk("He"), _Chunk("Hello")])
    session = _Session(resp)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r1",
        client_id="c1",
        agent_id="",
        question_for_rag="q",
        rag_session=session,
        ragflow_agent_service=None,
        cancel_event=cancel,
        t_submit=0.0,
        logger=logger,
        timings_set=timings_set,
        settings=RagflowStreamSettings(
            apply_qa_constraints=False,
            qa_no_self_intro=False,
            qa_max_answer_chars=0,
            safety_filter=_Safety(),
            safety_block_msg="blocked",
            enable_cleaning=False,
            text_cleaner=None,
            tts_buffer=None,
            start_tts_on_first_chunk=False,
            first_segment_min_chars=1,
            segment_flush_interval_s=0.8,
            segment_min_chars=3,
        ),
    )

    first = next(gen)
    assert first["chunk"] == "H"
    cancel.set()

    yielded, outcome = _drain(gen)
    assert all(not (it.get("done") is True and it.get("chunk") == "") for it in yielded)
    assert outcome.cancelled is True
    assert outcome.done_sent is False
    assert outcome.save_allowed is False
    assert outcome.cache_put_allowed is False
    assert resp.closed is True
