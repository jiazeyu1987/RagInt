from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class AppDeps:
    base_dir: Path
    logger: logging.Logger

    ragflow_service: Any
    ragflow_agent_service: Any
    history_store: Any
    asr_service: Any
    tts_service: Any
    intent_service: Any
    tour_planner: Any
    request_registry: Any
    event_store: Any
    recording_store: Any
    ask_timings: Any

    session: Any = None
    ragflow_default_chat_name: str = ""
