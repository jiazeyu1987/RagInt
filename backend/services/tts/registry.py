from __future__ import annotations

import logging
import threading

from backend.services.config_utils import get_nested
from backend.services.tts.providers.bailian import stream_bailian_tts
from backend.services.tts.providers.edge import stream_edge
from backend.services.tts.providers.local_gpt_sovits import get_local_tts_cfg, stream_local_gpt_sovits
from backend.services.tts.providers.sapi import stream_sapi_tts


def _is_rate_quota_error(exc: Exception) -> bool:
    text = str(exc or "").strip()
    if not text:
        return False
    return "Throttling.RateQuota" in text or "Requests rate limit exceeded" in text


def _is_bailian_missing_config_error(exc: Exception) -> bool:
    text = str(exc or "").strip().lower()
    if not text:
        return False
    markers = (
        "tts.bailian.api_key is required",
        "tts.bailian.voice is required",
        "tts.bailian.url is required",
        "dashscope sdk not available",
    )
    return any(marker in text for marker in markers)


def _is_bailian_recoverable_error(exc: Exception) -> bool:
    text = str(exc or "").strip().lower()
    if not text:
        return False
    if _is_bailian_missing_config_error(exc):
        return True
    markers = (
        '"error_code":"invalidparameter"',
        "invalid payload data",
        "engine return error code: 418",
    )
    return any(marker in text for marker in markers)


def _provider_enabled(config: dict, provider: str) -> bool:
    cfg = get_nested(config, ["tts", str(provider).strip().lower()], {}) or {}
    if not isinstance(cfg, dict):
        return True
    return cfg.get("enabled") is not False


def _stream_with_edge_then_sapi(
    *,
    text: str,
    request_id: str,
    config: dict,
    logger: logging.Logger,
    cancel_event: threading.Event | None = None,
    reason: str = "",
):
    if _provider_enabled(config, "edge"):
        try:
            logger.warning(f"[{request_id}] {reason} -> fallback_to=edge")
            yield from stream_edge(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)
            return
        except Exception as edge_exc:  # noqa: BLE001
            logger.warning(f"[{request_id}] edge_fallback_failed err={edge_exc}")
    if _provider_enabled(config, "sapi"):
        logger.warning(f"[{request_id}] {reason} -> fallback_to=sapi")
        yield from stream_sapi_tts(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)
        return
    raise RuntimeError("tts_fallback_unavailable: edge_and_sapi_disabled_or_failed")


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
        try:
            yield from stream_bailian_tts(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)
            return
        except Exception as exc:  # noqa: BLE001
            if _is_rate_quota_error(exc):
                yield from _stream_with_edge_then_sapi(
                    text=text,
                    request_id=request_id,
                    config=config,
                    logger=logger,
                    cancel_event=cancel_event,
                    reason="modelscope_rate_limited",
                )
                return
            if _is_bailian_recoverable_error(exc):
                logger.warning(f"[{request_id}] modelscope_unavailable_fallback err={exc}")
                yield from _stream_with_edge_then_sapi(
                    text=text,
                    request_id=request_id,
                    config=config,
                    logger=logger,
                    cancel_event=cancel_event,
                    reason="modelscope_unavailable",
                )
                return
            raise

    local_provider = provider_norm
    if local_provider in ("local", "gpt_sovits"):
        local_provider = "sovtts1"

    if local_provider not in ("sovtts1", "sovtts2"):
        logger.warning(f"[{request_id}] unknown_tts_provider provider={provider_norm} -> fallback_to=sovtts1")
        local_provider = "sovtts1"

    tts_cfg = get_local_tts_cfg(config, local_provider)
    # For explicitly selected local providers (SOVTTS1/SOVTTS2), we only honor the per-provider
    # enabled flag (if present). Do not gate on legacy `tts.local.enabled`, otherwise UI switching
    # would never take effect when the global flag is left false.
    if tts_cfg.get("enabled") is False:
        bailian_cfg = get_nested(config, ["tts", "bailian"], {}) or {}
        if str(bailian_cfg.get("api_key", "")).strip() and str(bailian_cfg.get("voice", "")).strip():
            logger.info(f"[{request_id}] local_tts_disabled -> fallback_to_modelscope")
            yield from stream_bailian_tts(text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event)
            return
        raise ValueError("local TTS is disabled and modelscope/bailian is not configured")

    logger.info(f"[{request_id}] tts_provider_select provider={local_provider}")
    yield from stream_local_gpt_sovits(
        text=text, request_id=request_id, config=config, logger=logger, cancel_event=cancel_event, local_provider=local_provider
    )
