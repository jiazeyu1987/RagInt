from __future__ import annotations

from backend.api.request_context import get_client_id


def handle_cancel_request(*, deps, req, data: dict) -> dict:
    request_id = str((data.get("request_id") or "")).strip()
    client_id = get_client_id(req, data=data, default="-")
    reason = str((data.get("reason") or "client_cancel")).strip()

    cancelled = False
    cancelled_id = None
    if request_id:
        cancelled = deps.request_registry.cancel(request_id, reason=reason)
        cancelled_id = request_id if cancelled else None
    else:
        cancelled_id = deps.request_registry.cancel_active(client_id=client_id, kind="ask", reason=reason)
        cancelled = bool(cancelled_id)

    deps.logger.info(
        f"[{request_id or '-'}] cancel_request client_id={client_id} cancelled={cancelled} target={cancelled_id} reason={reason}"
    )
    if cancelled_id:
        deps.event_store.emit(
            request_id=cancelled_id,
            client_id=client_id,
            kind="cancel",
            name="cancel",
            level="info",
            reason=reason,
        )

    return {"ok": True, "cancelled": cancelled, "request_id": cancelled_id, "client_id": client_id}
