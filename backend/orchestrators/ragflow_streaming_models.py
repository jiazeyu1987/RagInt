from __future__ import annotations

from dataclasses import dataclass

from backend.services.safety_filter import SensitiveWordsFilter


@dataclass(frozen=True)
class AskStreamOutcome:
    answer: str
    blocked: bool = False
    cancelled: bool = False
    done_sent: bool = True
    save_allowed: bool = True
    cache_put_allowed: bool = False


@dataclass(frozen=True)
class RagflowStreamSettings:
    apply_qa_constraints: bool
    qa_no_self_intro: bool
    qa_max_answer_chars: int
    safety_filter: SensitiveWordsFilter
    safety_block_msg: str
    enable_cleaning: bool
    text_cleaner: object | None
    tts_buffer: object | None
    start_tts_on_first_chunk: bool
    first_segment_min_chars: int
    segment_flush_interval_s: float
    segment_min_chars: int
