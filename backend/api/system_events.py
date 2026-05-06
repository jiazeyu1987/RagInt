from __future__ import annotations

import time
from dataclasses import dataclass

from backend.api.system_utils import derive_status_metrics, find_ask_context

_CLIENT_EVENT_TIMING_MAP = {
    "ask_client_start": "t_ask_client_start_ms",
    "ask_client_submit": "t_ask_client_submit_ms",
    "asr_pending_asr_matched": "t_asr_pending_ms",
    "asr_filtering_started": "t_asr_filter_start_ms",
    "asr_filtering_finished": "t_asr_filter_end_ms",
    "asr_filtering_failed": "t_asr_filter_end_ms",
    "asr_accepted": "t_asr_accepted_ms",
}


@dataclass(frozen=True)
class ClientEventIngest:
    request_id: str
    client_id: str
    kind: str
    name: str
    level: str
    fields: dict


def parse_client_event(*, req, data: dict | None) -> ClientEventIngest:
    payload = data if isinstance(data, dict) else {}
    request_id = str((payload.get("request_id") or payload.get("rid") or req.headers.get("X-Request-ID") or "")).strip()
    client_id = str((payload.get("client_id") or payload.get("cid") or req.headers.get("X-Client-ID") or "")).strip() or "-"
    kind = str((payload.get("kind") or "client")).strip() or "client"
    name = str((payload.get("name") or payload.get("event") or "")).strip()
    level = str((payload.get("level") or "info")).strip() or "info"
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
    return ClientEventIngest(
        request_id=request_id,
        client_id=client_id,
        kind=kind,
        name=name,
        level=level,
        fields=fields,
    )


def _extract_client_wall_ms(fields: dict) -> int | None:
    data = fields if isinstance(fields, dict) else {}
    candidates = (
        data.get("t_client_wall_ms"),
        data.get("t_wall_ms"),
        data.get("asr_event_ts_ms"),
        data.get("client_wall_ms"),
    )
    for raw in candidates:
        try:
            v = int(raw)
        except Exception:
            continue
        # Heuristic: epoch-ms after 2000-01-01.
        if v >= 946684800000:
            return v
    return None


def ingest_client_event(*, deps, event: ClientEventIngest) -> bool:
    if not event.request_id or not event.name:
        return False

    try:
        deps.event_store.emit(
            request_id=event.request_id,
            client_id=event.client_id,
            kind=event.kind,
            name=event.name,
            level=event.level,
            **(event.fields or {}),
        )
    except Exception:
        return False

    now_perf = time.perf_counter()
    client_wall_ms = _extract_client_wall_ms(event.fields)
    try:
        if event.name in ("play_end", "tts_play_end", "playback_end"):
            updates = {"t_play_end": now_perf}
            if client_wall_ms is not None:
                updates["t_play_end_client_ms"] = int(client_wall_ms)
            deps.ask_timings.set(event.request_id, **updates)
        timing_key = _CLIENT_EVENT_TIMING_MAP.get(str(event.name or "").strip())
        if timing_key and client_wall_ms is not None:
            deps.ask_timings.set(event.request_id, **{timing_key: int(client_wall_ms)})
    except Exception:
        return False

    return True


def parse_status_request_id(req) -> str:
    return str((req.args.get("request_id") or req.headers.get("X-Request-ID") or "")).strip()


def build_status_payload(*, deps, request_id: str) -> dict:
    now = time.perf_counter()
    timing = deps.ask_timings.get(request_id) or {}
    cancel_info = deps.request_registry.get_info(request_id) or {}
    cancelled = bool(cancel_info.get("canceled_at")) or deps.request_registry.is_cancelled(request_id)
    tts_state = deps.tts_service.tts_state_get(request_id) or {}
    derived = derive_status_metrics(timing=timing, now_perf=now)
    ask_context = find_ask_context(event_store=deps.event_store, request_id=request_id)

    return {
        "request_id": request_id,
        "cancelled": cancelled,
        "cancel": cancel_info,
        "timing": timing,
        "derived_ms": derived,
        "tts_state": tts_state,
        "last_error": deps.event_store.last_error(request_id=request_id),
        "context": ask_context,
    }
