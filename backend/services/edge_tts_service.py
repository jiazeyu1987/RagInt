from __future__ import annotations

import contextlib
import logging
import queue
import threading

from .config_utils import get_nested


def _coerce_edge_percent(val, *, default="0%") -> str:
    if val is None:
        return default
    if isinstance(val, (int, float)):
        n = float(val)
        sign = "+" if n >= 0 else ""
        return f"{sign}{n:.0f}%"
    s = str(val).strip()
    if not s:
        return default
    # edge-tts expects signed percent strings like "+0%" or "-10%".
    if s.endswith("%") and s[:1] not in ("+", "-"):
        return f"+{s}"
    return s


def stream_edge_tts(
    *,
    text: str,
    request_id: str,
    config: dict,
    logger: logging.Logger,
    cancel_event: threading.Event | None = None,
):
    cfg = get_nested(config, ["tts", "edge"], {}) or {}
    if cfg.get("enabled") is False:
        raise ValueError("tts.edge.enabled=false")

    voice = str(cfg.get("voice", "zh-CN-XiaoxiaoNeural")).strip() or "zh-CN-XiaoxiaoNeural"
    output_format = str(cfg.get("output_format", "riff-16khz-16bit-mono-pcm")).strip() or "riff-16khz-16bit-mono-pcm"
    rate = _coerce_edge_percent(cfg.get("rate", "0%"), default="0%")
    volume = _coerce_edge_percent(cfg.get("volume", "0%"), default="0%")

    timeout_s = float(cfg.get("timeout_s", 30) or 30)
    first_audio_timeout_s = float(cfg.get("first_audio_timeout_s", 12) or 12)
    queue_max_chunks = int(cfg.get("queue_max_chunks", 256) or 256)

    cancel_event = cancel_event or threading.Event()
    if cancel_event.is_set():
        return

    q: queue.Queue[bytes | Exception | None] = queue.Queue(maxsize=max(16, queue_max_chunks))

    def producer():
        try:
            try:
                import asyncio
                import edge_tts
            except Exception as e:
                q.put(RuntimeError(f"edge_tts_not_available: {e}"))
                return

            async def run():
                comm = edge_tts.Communicate(text=text, voice=voice, rate=rate, volume=volume)
                with contextlib.suppress(Exception):
                    if hasattr(comm, "options") and isinstance(comm.options, dict):
                        comm.options["output_format"] = output_format
                async for item in comm.stream():
                    if cancel_event.is_set():
                        return
                    if not isinstance(item, dict):
                        continue
                    if item.get("type") != "audio":
                        continue
                    data = item.get("data")
                    if isinstance(data, (bytes, bytearray)) and data:
                        q.put(bytes(data))

            async def guarded():
                await asyncio.wait_for(run(), timeout=max(2.0, float(timeout_s)))

            asyncio.run(guarded())
        except Exception as e:
            with contextlib.suppress(Exception):
                q.put(e)
        finally:
            with contextlib.suppress(Exception):
                q.put(None)

    t = threading.Thread(target=producer, daemon=True)
    t.start()

    logger.info(
        f"[{request_id}] edge_tts_request voice={voice!r} format={output_format} rate={rate!r} volume={volume!r} timeout_s={timeout_s}"
    )

    first = True
    while True:
        if cancel_event.is_set():
            logger.info(f"[{request_id}] edge_tts_cancelled")
            return
        try:
            wait_s = float(first_audio_timeout_s) if first else max(0.5, min(2.0, float(timeout_s)))
            item = q.get(timeout=max(0.5, wait_s))
        except queue.Empty:
            if first:
                raise RuntimeError("edge_tts_timeout_waiting_for_first_audio")
            raise RuntimeError("edge_tts_timeout_waiting_for_audio")
        if item is None:
            return
        if isinstance(item, Exception):
            raise item
        if item:
            first = False
            yield item
