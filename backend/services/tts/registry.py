from __future__ import annotations

import logging
import threading

from backend.services.tts.providers.bailian import stream_bailian_tts
from backend.services.tts.providers.edge import stream_edge
from backend.services.tts.providers.local_gpt_sovits import get_local_tts_cfg, stream_local_gpt_sovits
from backend.services.tts.providers.sapi import stream_sapi_tts


def stream_tts(
    *,
    text: str,
    request_id: str,
    config: dict,
    provider: str,
    logger: logging.Logger,
    cancel_event: threading.Event | None = None,
    segment_index=None,
    endpoint: str = "",
):
    provider_norm = (provider or "").strip().lower() or "sovtts1"

    # Provider naming (UI):
    # - sovtts1: local GPT-SoVITS api.py (root "/")
    # - sovtts2: local GPT-SoVITS api_v2.py ("/tts")
    # - modelscope: online (current implementation uses bailian/dashscope)
    # - flash: cosyvoice-v3-flash (mapped to bailian/dashscope)
    # - sapi: Windows SAPI (System.Speech)
    # - edge: Edge TTS (Microsoft)
    if provider_norm == "sapi":
        logger.info(f"[{request_id}] tts_provider_select provider=sapi")
        yield from stream_sapi_tts(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)
        return
    if provider_norm == "edge":
        logger.info(f"[{request_id}] tts_provider_select provider=edge")
        yield from stream_edge(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)
        return
    if provider_norm in ("bailian", "dashscope", "modelscope", "flash"):
        logger.info(f"[{request_id}] tts_provider_select provider=modelscope(mapped_to=bailian)")
        yield from stream_bailian_tts(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)
        return

    local_provider = provider_norm
    if local_provider in ("local", "gpt_sovits"):
        local_provider = "sovtts1"

    if local_provider not in ("sovtts1", "sovtts2"):
        raise ValueError(f"unknown_tts_provider:{provider_norm}")

    tts_cfg = get_local_tts_cfg(config, local_provider)
    # For explicitly selected local providers (SOVTTS1/SOVTTS2), we only honor the per-provider
    # enabled flag (if present). Do not gate on legacy `tts.local.enabled`, otherwise UI switching
    # would never take effect when the global flag is left false.
    if tts_cfg.get("enabled") is False:
        raise ValueError(f"tts_provider_disabled:{local_provider}")

    logger.info(f"[{request_id}] tts_provider_select provider={local_provider}")
    yield from stream_local_gpt_sovits(
        text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event, local_provider=local_provider
    )
