from __future__ import annotations

import logging
import threading

from backend.services.edge_tts_service import stream_edge_tts


def stream_edge(*, text: str, request_id: str, config: dict, logger: logging.Logger, cancel_event: threading.Event | None = None):
    yield from stream_edge_tts(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)

