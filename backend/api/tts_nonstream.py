from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from backend.api.request_context import get_client_id, get_request_id


@dataclass(frozen=True)
class TtsRequestContext:
    text: str
    request_id: str
    client_id: str
    segment_index: int | str | None
    cancel_event: object


def parse_tts_request_context(*, deps, req, data: dict | None) -> tuple[TtsRequestContext | None, dict | None]:
    payload = data if isinstance(data, dict) else {}
    text = str(payload.get("text") or "")
    if not text:
        return None, {"error": "No text"}
    request_id = get_request_id(req, data=payload, prefix="tts")
    client_id = get_client_id(req, data=payload, default="-")
    segment_index = payload.get("segment_index", None)
    cancel_event = deps.request_registry.get_cancel_event(request_id)
    return (
        TtsRequestContext(
            text=text,
            request_id=request_id,
            client_id=client_id,
            segment_index=segment_index,
            cancel_event=cancel_event,
        ),
        None,
    )


def emit_tts_request_received(*, deps, ctx: TtsRequestContext, endpoint: str, method: str | None = None) -> None:
    fields = {
        "request_id": ctx.request_id,
        "client_id": ctx.client_id,
        "kind": "tts",
        "name": "tts_request_received",
        "endpoint": endpoint,
        "chars": len(ctx.text or ""),
        "segment_index": ctx.segment_index,
    }
    if method:
        fields["method"] = method
    deps.event_store.emit(**fields)


def stream_tts_audio(*, deps, ctx: TtsRequestContext, app_config: dict, provider: str, endpoint: str) -> Iterable[bytes]:
    try:
        deps.logger.info(f"[{ctx.request_id}] tts_generate_start provider={provider}")
        yield from deps.tts_service.stream(
            text=ctx.text,
            request_id=ctx.request_id,
            config=app_config,
            provider=provider,
            endpoint=endpoint,
            segment_index=ctx.segment_index,
            cancel_event=ctx.cancel_event,
        )
    except GeneratorExit:
        deps.logger.info(f"[{ctx.request_id}] tts_generator_exit endpoint={endpoint} (client_disconnect?)")
        deps.event_store.emit(
            request_id=ctx.request_id,
            client_id=ctx.client_id,
            kind="tts",
            name="tts_client_disconnect",
            level="warn",
            endpoint=endpoint,
        )
        raise
    except Exception as e:  # noqa: BLE001
        deps.logger.error(f"[{ctx.request_id}] tts_generate_failed: {e}", exc_info=True)
        deps.event_store.emit(
            request_id=ctx.request_id,
            client_id=ctx.client_id,
            kind="tts",
            name="tts_failed",
            level="error",
            endpoint=endpoint,
            err=str(e),
        )
