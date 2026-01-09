from __future__ import annotations

import logging
import threading

from backend.services.sapi_tts import stream_sapi


def stream_sapi_tts(*, text: str, request_id: str, config: dict, logger: logging.Logger, cancel_event: threading.Event | None = None):
    yield from stream_sapi(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)

