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


class _ChunkWithNoneContent:
    content = None


class _ChunkWithoutContent:
    pass


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


class _KeyErrorStream:
    def __iter__(self):
        return self

    def __next__(self):
        raise KeyError("chunk_id")


class _ProtocolMismatchSession:
    def __init__(self):
        self.calls: list[bool] = []

    def ask(self, _q: str, stream: bool = True):  # noqa: ARG002
        self.calls.append(bool(stream))
        if stream:
            return _KeyErrorStream()
        return _Resp([_Chunk("nonstream answer")])


class _Safety:
    enabled = False


class _FailingCurrentSentenceBuffer:
    @property
    def current_sentence(self) -> str:
        return ""

    @current_sentence.setter
    def current_sentence(self, _value: str) -> None:
        raise RuntimeError("current_sentence_failed")

    def finalize(self):
        return []


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
    timing_calls = []

    def timings_set(_rid: str, **_kw) -> None:
        timing_calls.append(dict(_kw))

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
    assert any("t_ragflow_request_start" in item for item in timing_calls)


def test_stream_ragflow_response_empty_content_is_no_output_not_parse_failure():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_Chunk("")])
    session = _Session(resp)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r-empty",
        client_id="c-empty",
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
    assert yielded == [{"chunk": "", "done": True}]
    assert outcome.answer == ""
    assert outcome.save_allowed is True
    assert outcome.cache_put_allowed is False


def test_stream_ragflow_response_missing_content_schema_is_exposed_as_error():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_ChunkWithoutContent()])
    session = _Session(resp)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r-schema",
        client_id="c-schema",
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
    assert len(yielded) == 1
    assert yielded[0]["done"] is True
    assert "missing content" in yielded[0]["chunk"]
    assert outcome.answer == ""
    assert outcome.save_allowed is False


def test_stream_ragflow_response_none_content_schema_is_exposed_as_error():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_ChunkWithNoneContent()])
    session = _Session(resp)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r-none",
        client_id="c-none",
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
    assert len(yielded) == 1
    assert yielded[0]["done"] is True
    assert "content is None" in yielded[0]["chunk"]
    assert outcome.answer == ""
    assert outcome.save_allowed is False


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


def test_stream_ragflow_response_strips_think_blocks_from_visible_output():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp(
        [
            _Chunk("答:"),
            _Chunk("答:<think>内部推理"),
            _Chunk("答:<think>内部推理</think>你好"),
        ]
    )
    session = _Session(resp)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r2",
        client_id="c2",
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
    assert chunks == ["答:", "你好", ""]
    assert outcome.answer == "答:你好"


def test_stream_ragflow_response_protocol_mismatch_fails_without_nonstream_fallback():
    logger = _Logger()
    cancel = _Cancel(False)
    session = _ProtocolMismatchSession()

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r3",
        client_id="c3",
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
    assert session.calls == [True]
    assert yielded == [{"chunk": "错误: 'chunk_id'", "done": True}]
    assert outcome.answer == ""
    assert outcome.done_sent is True
    assert outcome.save_allowed is False


def test_stream_ragflow_response_timing_done_failure_is_exposed():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_Chunk("Hello")])
    session = _Session(resp)

    def timings_set(_rid: str, **kw) -> None:
        if "t_rag_done" in kw:
            raise RuntimeError("timing_done_failed")

    gen = _stream_ragflow_response(
        request_id="r4",
        client_id="c4",
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
    assert yielded[-1]["done"] is True
    assert "timing_done_failed" in yielded[-1]["chunk"]
    assert outcome.answer == ""
    assert outcome.done_sent is True
    assert outcome.save_allowed is False


def test_stream_ragflow_response_tts_buffer_tail_failure_is_exposed():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_Chunk("Hello")])
    session = _Session(resp)

    def timings_set(_rid: str, **_kw) -> None:
        return None

    gen = _stream_ragflow_response(
        request_id="r5",
        client_id="c5",
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
            text_cleaner=object(),
            tts_buffer=_FailingCurrentSentenceBuffer(),
            start_tts_on_first_chunk=False,
            first_segment_min_chars=1,
            segment_flush_interval_s=0.8,
            segment_min_chars=3,
        ),
    )

    yielded, outcome = _drain(gen)
    assert yielded[-1]["done"] is True
    assert "current_sentence_failed" in yielded[-1]["chunk"]
    assert outcome.answer == ""
    assert outcome.done_sent is True
    assert outcome.save_allowed is False
