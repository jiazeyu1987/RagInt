from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from .config_utils import get_nested
from infra.cancellation import CancellationRegistry
from infra.event_store import EventStore
from adapters.nav_provider import build_nav_provider


@dataclass
class NavStatus:
    client_id: str
    request_id: str
    stop_id: str
    stop_name: str
    state: str  # idle|moving|arrived|failed|cancelled|estop|timeout
    provider: str
    reason: str | None = None
    updated_at_ms: int = 0
    started_at_ms: int = 0

    def to_dict(self) -> dict:
        return {
            "client_id": self.client_id,
            "request_id": self.request_id,
            "stop_id": self.stop_id,
            "stop_name": self.stop_name,
            "state": self.state,
            "provider": self.provider,
            "reason": self.reason,
            "updated_at_ms": int(self.updated_at_ms),
            "started_at_ms": int(self.started_at_ms),
        }


class NavService:
    """
    Minimal navigation orchestration:
    - go_to(stop_id) starts a move (single active per client).
    - state can be queried by client_id or request_id.
    - cancel integrates with RequestRegistry cancel events.

    Provider:
    - mock: in-process simulated arrival (for dev/demo).
    - http: delegate to an external chassis/nav gateway (config-driven).
    """

    def __init__(self, *, request_registry: CancellationRegistry, event_store: EventStore):
        self._req = request_registry
        self._events = event_store
        self._lock = threading.Lock()
        self._by_client: dict[str, NavStatus] = {}
        self._by_request: dict[str, NavStatus] = {}

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def get_state(self, *, client_id: str | None = None, request_id: str | None = None) -> dict:
        cid = str(client_id or "").strip()
        rid = str(request_id or "").strip()
        with self._lock:
            st = None
            if rid:
                st = self._by_request.get(rid)
            if st is None and cid:
                st = self._by_client.get(cid)
            return st.to_dict() if st else {"state": "idle", "client_id": cid or "-", "request_id": rid or ""}

    def cancel(self, *, client_id: str, request_id: str | None = None, reason: str = "cancelled") -> dict:
        cid = str(client_id or "-").strip() or "-"
        rid = str(request_id or "").strip()

        if rid:
            self._req.cancel(rid, reason=reason)
            with self._lock:
                st = self._by_request.get(rid)
                if st and st.state not in ("arrived", "failed", "cancelled", "estop", "timeout"):
                    st.state = "cancelled"
                    st.reason = reason
                    st.updated_at_ms = self._now_ms()
        else:
            rid = self._req.cancel_active(client_id=cid, kind="nav", reason=reason) or ""
            with self._lock:
                st = self._by_client.get(cid)
                if st and st.state not in ("arrived", "failed", "cancelled", "estop", "timeout"):
                    st.state = "cancelled"
                    st.reason = reason
                    st.updated_at_ms = self._now_ms()

        if rid:
            self._events.emit(request_id=rid, client_id=cid, kind="nav", name="nav_cancelled", reason=reason)
        return {"ok": True, "client_id": cid, "request_id": rid, "reason": reason}

    def go_to(
        self,
        *,
        config: dict,
        client_id: str,
        request_id: str,
        stop_id: str,
        stop_name: str = "",
        timeout_s: float | None = None,
    ) -> dict:
        cid = str(client_id or "-").strip() or "-"
        rid = str(request_id or "").strip()
        sid = str(stop_id or "").strip()
        sname = str(stop_name or "").strip()
        if not rid:
            raise ValueError("request_id_required")
        if not sid:
            raise ValueError("stop_id_required")

        nav_cfg = get_nested(config, ["nav"], {}) or {}
        provider = str((nav_cfg.get("provider") or "disabled")).strip().lower() if isinstance(nav_cfg, dict) else "disabled"
        # validate provider early for clearer error codes
        if provider not in ("mock", "http"):
            raise ValueError("nav_disabled")

        if timeout_s is None:
            timeout_s = float(nav_cfg.get("timeout_s") or 30.0)
        timeout_s = max(5.0, min(float(timeout_s), 600.0))

        cancel_ev = self._req.register(client_id=cid, request_id=rid, kind="nav", cancel_previous=True, cancel_reason="replaced_by_new_nav")
        now_ms = self._now_ms()
        st = NavStatus(
            client_id=cid,
            request_id=rid,
            stop_id=sid,
            stop_name=sname,
            state="moving",
            provider=provider,
            reason=None,
            updated_at_ms=now_ms,
            started_at_ms=now_ms,
        )
        with self._lock:
            self._by_client[cid] = st
            self._by_request[rid] = st

        self._events.emit(
            request_id=rid,
            client_id=cid,
            kind="nav",
            name="nav_start",
            stop_id=sid,
            stop_name=sname,
            provider=provider,
            timeout_s=timeout_s,
        )

        t = threading.Thread(
            target=self._run_move,
            kwargs={
                "config": dict(config or {}),
                "status": st,
                "cancel_ev": cancel_ev,
                "timeout_s": float(timeout_s),
            },
            daemon=True,
        )
        t.start()

        return {"ok": True, "state": "moving", "provider": provider, "client_id": cid, "request_id": rid}

    def _set_terminal(self, st: NavStatus, *, state: str, reason: str | None = None) -> None:
        if state not in ("arrived", "failed", "cancelled", "estop", "timeout"):
            return
        with self._lock:
            cur = self._by_request.get(st.request_id)
            if not cur:
                return
            # Do not overwrite another newer request's state for the same client.
            if self._by_client.get(cur.client_id, cur).request_id != cur.request_id:
                return
            cur.state = state
            cur.reason = reason
            cur.updated_at_ms = self._now_ms()

        name = {
            "arrived": "nav_arrived",
            "failed": "nav_failed",
            "cancelled": "nav_cancelled",
            "estop": "nav_estop",
            "timeout": "nav_timeout",
        }.get(state, "nav_done")
        self._events.emit(
            request_id=st.request_id,
            client_id=st.client_id,
            kind="nav",
            name=name,
            stop_id=st.stop_id,
            stop_name=st.stop_name,
            provider=st.provider,
            reason=reason or "",
        )

    def _run_move(self, *, config: dict, status: NavStatus, cancel_ev: threading.Event, timeout_s: float) -> None:
        started = time.time()
        try:
            p = build_nav_provider(config)
            res = p.run_move(
                config=config,
                client_id=status.client_id,
                request_id=status.request_id,
                stop_id=status.stop_id,
                stop_name=status.stop_name,
                cancel_ev=cancel_ev,
                timeout_s=float(timeout_s),
            )
            self._set_terminal(status, state=res.state, reason=res.reason)
        except Exception as e:
            self._set_terminal(status, state="failed", reason=f"nav_exception:{type(e).__name__}")
        finally:
            # Best-effort: if nothing set terminal, mark timeout.
            with self._lock:
                cur = self._by_request.get(status.request_id)
                cur_state = cur.state if cur else ""
            if cur_state == "moving" and (time.time() - started) > float(timeout_s):
                self._set_terminal(status, state="timeout", reason="nav_timeout")
            self._req.clear_active(client_id=status.client_id, kind="nav", request_id=status.request_id)
