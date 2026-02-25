from __future__ import annotations

import contextlib
import time
from dataclasses import dataclass

from backend.api.system_utils import derive_status_metrics, find_ask_context


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


def ingest_client_event(*, deps, event: ClientEventIngest) -> bool:
    if not event.request_id or not event.name:
        return False

    with contextlib.suppress(Exception):
        deps.event_store.emit(
            request_id=event.request_id,
            client_id=event.client_id,
            kind=event.kind,
            name=event.name,
            level=event.level,
            **(event.fields or {}),
        )

    with contextlib.suppress(Exception):
        now_perf = time.perf_counter()
        if event.name in ("play_end", "tts_play_end", "playback_end"):
            deps.ask_timings.set(event.request_id, t_play_end=now_perf)

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
