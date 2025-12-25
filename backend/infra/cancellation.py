from __future__ import annotations

import threading
from dataclasses import dataclass

from services.request_registry import RequestRegistry


class CancelledError(RuntimeError):
    def __init__(self, request_id: str, reason: str | None = None):
        super().__init__(reason or "cancelled")
        self.request_id = request_id
        self.reason = reason


@dataclass(frozen=True)
class CancelToken:
    request_id: str
    event: threading.Event
    reason: str | None = None

    def checkpoint(self) -> None:
        if self.event.is_set():
            raise CancelledError(self.request_id, self.reason)


class CancellationRegistry:
    """
    Thin wrapper around `services.request_registry.RequestRegistry`.

    Purpose:
    - Provide a stable "infra" API for cancellation/interrupts.
    - Keep app/services decoupled from the underlying implementation.
    """

    def __init__(self):
        self._registry = RequestRegistry()

    def rate_allow(self, client_id: str, kind: str, *, limit: int, window_s: float) -> bool:
        return self._registry.rate_allow(client_id, kind, limit=limit, window_s=window_s)

    def register(
        self,
        *,
        client_id: str,
        request_id: str,
        kind: str,
        cancel_previous: bool = True,
        cancel_reason: str = "replaced_by_new",
    ) -> threading.Event:
        return self._registry.register(
            client_id=client_id,
            request_id=request_id,
            kind=kind,
            cancel_previous=cancel_previous,
            cancel_reason=cancel_reason,
        )

    def register_token(
        self,
        *,
        client_id: str,
        request_id: str,
        kind: str,
        cancel_previous: bool = True,
        cancel_reason: str = "replaced_by_new",
    ) -> CancelToken:
        ev = self.register(
            client_id=client_id,
            request_id=request_id,
            kind=kind,
            cancel_previous=cancel_previous,
            cancel_reason=cancel_reason,
        )
        return CancelToken(request_id=request_id, event=ev, reason=cancel_reason)

    def clear_active(self, *, client_id: str, kind: str, request_id: str) -> None:
        self._registry.clear_active(client_id=client_id, kind=kind, request_id=request_id)

    def cancel(self, request_id: str, *, reason: str = "cancelled") -> bool:
        return self._registry.cancel(request_id, reason=reason)

    def cancel_active(self, *, client_id: str, kind: str, reason: str = "cancelled") -> str | None:
        return self._registry.cancel_active(client_id=client_id, kind=kind, reason=reason)

    def cancel_all_active(self, *, client_id: str, reason: str = "cancelled") -> list[str]:
        return self._registry.cancel_all_active(client_id=client_id, reason=reason)

    def get_cancel_event(self, request_id: str) -> threading.Event:
        return self._registry.get_cancel_event(request_id)

    def is_cancelled(self, request_id: str) -> bool:
        return self._registry.is_cancelled(request_id)

    def get_info(self, request_id: str) -> dict | None:
        return self._registry.get_info(request_id)
