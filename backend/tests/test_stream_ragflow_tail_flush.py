from __future__ import annotations

from backend.orchestrators.ragflow_streaming import RagflowStreamSettings, _stream_ragflow_response


class _Logger:
    def info(self, _msg: str) -> None:  # noqa: D401
        return None

    def warning(self, _msg: str) -> None:  # noqa: D401
        return None

    def error(self, _msg: str, exc_info: bool = False) -> None:  # noqa: ARG002,D401
        return None


class _Cancel:
    def __init__(self, is_set: bool = False):
        self._is_set = bool(is_set)

    def is_set(self) -> bool:
        return bool(self._is_set)


class _Chunk:
    def __init__(self, content: str):
        self.content = str(content)


class _Resp:
    def __init__(self, chunks: list[_Chunk]):
        self._chunks = list(chunks)

    def __iter__(self):
        yield from self._chunks

    def close(self) -> None:
        return None


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


def test_stream_ragflow_response_flushes_tail_segment_on_finalize():
    logger = _Logger()
    cancel = _Cancel(False)
    resp = _Resp([_Chunk("h"), _Chunk("he"), _Chunk("hello")])
    session = _Session(resp)

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
    segments = [it["segment"] for it in yielded if "segment" in it]
    assert segments == ["hello"]
    assert outcome.answer == "hello"
