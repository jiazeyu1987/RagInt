from __future__ import annotations

from backend.orchestrators.ragflow_streaming import RagflowStreamSettings
from backend.services.ragflow_chunk_manager import RagflowChunkManager


class _Logger:
    def info(self, _msg: str) -> None:
        return None

    def warning(self, _msg: str) -> None:
        return None

    def error(self, _msg: str, exc_info: bool = False) -> None:  # noqa: ARG002
        return None


class _Cancel:
    def is_set(self) -> bool:
        return False


class _Chunk:
    def __init__(self, content: str):
        self.content = content


class _Resp:
    def __iter__(self):
        yield _Chunk("你")
        yield _Chunk("你好")

    def close(self) -> None:
        return None


class _Session:
    def ask(self, _q: str, stream: bool = True):  # noqa: ARG002
        return _Resp()


class _Safety:
    enabled = False


def _drain(gen):
    items = []
    try:
        while True:
            items.append(next(gen))
    except StopIteration as exc:
        return items, exc.value


def test_chunk_manager_delegates_to_streaming_core():
    mgr = RagflowChunkManager(ragflow_agent_service=None)
    yielded, outcome = _drain(
        mgr.stream_response(
            request_id="r1",
            client_id="c1",
            agent_id="",
            question_for_rag="q",
            rag_session=_Session(),
            cancel_event=_Cancel(),
            t_submit=0.0,
            logger=_Logger(),
            timings_set=lambda *_args, **_kwargs: None,
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
    )
    assert [item["chunk"] for item in yielded if "chunk" in item] == ["你", "好", ""]
    assert outcome.answer == "你好"

