from __future__ import annotations

from dataclasses import dataclass

from backend.api.request_context import get_client_id, get_request_id


@dataclass(frozen=True)
class TtsStreamRequest:
    text: str
    request_id: str
    client_id: str
    segment_index: int | str | None
    cancel_event: object
    recording_id: str | None
    stop_index: int | None


def _as_int_or_none(value):
    if value is None or str(value).strip() == "":
        return None
    return int(value)


def parse_tts_stream_request(*, deps, req, data: dict | None) -> tuple[TtsStreamRequest | None, dict | None]:
    payload = data if isinstance(data, dict) else {}
    text = str(payload.get("text") or "")
    if not text:
        return None, {"error": "No text"}

    request_id = get_request_id(req, data=payload, prefix="tts")
    client_id = get_client_id(req, data=payload, default="-")
    segment_index = payload.get("segment_index", None)
    cancel_event = deps.request_registry.get_cancel_event(request_id)
    recording_id = str((payload.get("recording_id") or req.headers.get("X-Recording-ID") or "")).strip() or None
    try:
        stop_index = _as_int_or_none(payload.get("stop_index", None))
    except (TypeError, ValueError):
        return None, {"error": "Invalid stop_index"}

    return (
        TtsStreamRequest(
            text=text,
            request_id=request_id,
            client_id=client_id,
            segment_index=segment_index,
            cancel_event=cancel_event,
            recording_id=recording_id,
            stop_index=stop_index,
        ),
        None,
    )


def emit_tts_stream_request_received(*, deps, req, parsed: TtsStreamRequest, endpoint: str) -> None:
    deps.event_store.emit(
        request_id=parsed.request_id,
        client_id=parsed.client_id,
        kind="tts",
        name="tts_request_received",
        endpoint=endpoint,
        method=req.method,
        chars=len(parsed.text or ""),
        segment_index=parsed.segment_index,
    )
