from __future__ import annotations

from flask import Response

from backend.api.sse_utils import SSEEncoder


def _rate_limit_policy(kind: str) -> tuple[int, float]:
    if kind in ("ask_prefetch", "prefetch", "prefetch_ask"):
        return 1, 2.5
    return 3, 2.5


def maybe_rate_limited_response(*, deps, client_id: str, kind: str, request_id: str, t_submit: float) -> Response | None:
    limit, window_s = _rate_limit_policy(kind)
    if deps.request_registry.rate_allow(client_id, kind, limit=limit, window_s=window_s):
        return None

    deps.logger.warning(f"[{request_id}] ask_rate_limited client_id={client_id} kind={kind}")
    deps.event_store.emit(
        request_id=request_id,
        client_id=client_id,
        kind="ask",
        name="ask_rate_limited",
        level="warn",
        ask_kind=kind,
        limit=limit,
        window_s=window_s,
    )

    enc = SSEEncoder(request_id=request_id, t_submit=t_submit)
    payload = {"chunk": "请求过于频繁，请稍等 1-2 秒再提问。", "done": True, "request_id": request_id}
    return Response(enc.event(payload), mimetype="text/event-stream")

