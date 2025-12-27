from __future__ import annotations

import threading
import time
from dataclasses import dataclass

import requests

from services.config_utils import get_nested


@dataclass(frozen=True)
class NavProviderResult:
    state: str  # arrived|failed|cancelled|estop|timeout
    reason: str | None = None


class NavProvider:
    name: str = "provider"

    def run_move(
        self,
        *,
        config: dict,
        client_id: str,
        request_id: str,
        stop_id: str,
        stop_name: str,
        cancel_ev: threading.Event,
        timeout_s: float,
    ) -> NavProviderResult:
        raise NotImplementedError


class MockNavProvider(NavProvider):
    name = "mock"

    def run_move(
        self,
        *,
        config: dict,
        client_id: str,
        request_id: str,
        stop_id: str,
        stop_name: str,
        cancel_ev: threading.Event,
        timeout_s: float,
    ) -> NavProviderResult:
        nav_cfg = get_nested(config, ["nav"], {}) or {}
        mock_cfg = nav_cfg.get("mock") if isinstance(nav_cfg, dict) else {}
        try:
            arrive_ms = int(get_nested(mock_cfg if isinstance(mock_cfg, dict) else {}, ["arrive_delay_ms"], 1500) or 1500)
        except Exception:
            arrive_ms = 1500
        arrive_ms = max(0, min(arrive_ms, int(timeout_s * 1000)))
        deadline = time.time() + float(timeout_s)
        end = time.time() + (arrive_ms / 1000.0)
        while time.time() < end:
            if cancel_ev.is_set():
                return NavProviderResult(state="cancelled", reason="cancelled")
            if time.time() >= deadline:
                return NavProviderResult(state="timeout", reason="nav_timeout")
            time.sleep(0.05)
        return NavProviderResult(state="arrived", reason=None)


class HttpNavProvider(NavProvider):
    name = "http"

    def run_move(
        self,
        *,
        config: dict,
        client_id: str,
        request_id: str,
        stop_id: str,
        stop_name: str,
        cancel_ev: threading.Event,
        timeout_s: float,
    ) -> NavProviderResult:
        nav_cfg = get_nested(config, ["nav"], {}) or {}
        http_cfg = nav_cfg.get("http") if isinstance(nav_cfg, dict) else {}
        if not isinstance(http_cfg, dict):
            http_cfg = {}

        base_url = str(http_cfg.get("base_url") or "").strip().rstrip("/")
        if not base_url:
            return NavProviderResult(state="failed", reason="nav_http_base_url_missing")

        go_to_path = str(http_cfg.get("go_to_path") or "/go_to").strip() or "/go_to"
        cancel_path = str(http_cfg.get("cancel_path") or "/cancel").strip() or "/cancel"
        state_path = str(http_cfg.get("state_path") or "/state").strip() or "/state"
        poll_ms = int(http_cfg.get("poll_interval_ms") or 400)
        poll_ms = max(100, min(poll_ms, 2000))

        headers = {"Content-Type": "application/json", "X-Client-ID": client_id, "X-Request-ID": request_id}
        payload = {"client_id": client_id, "request_id": request_id, "stop_id": stop_id, "stop_name": stop_name, "timeout_s": float(timeout_s)}

        try:
            with requests.post(f"{base_url}{go_to_path}", headers=headers, json=payload, timeout=10) as r:
                r.raise_for_status()
        except Exception as e:
            return NavProviderResult(state="failed", reason=f"nav_http_go_to_failed:{type(e).__name__}")

        deadline = time.time() + float(timeout_s)
        while True:
            if cancel_ev.is_set():
                try:
                    with requests.post(
                        f"{base_url}{cancel_path}",
                        headers=headers,
                        json={"client_id": client_id, "request_id": request_id},
                        timeout=5,
                    ) as _:
                        pass
                except Exception:
                    pass
                return NavProviderResult(state="cancelled", reason="cancelled")
            if time.time() >= deadline:
                return NavProviderResult(state="timeout", reason="nav_timeout")

            try:
                with requests.get(
                    f"{base_url}{state_path}",
                    headers=headers,
                    params={"client_id": client_id, "request_id": request_id},
                    timeout=5,
                ) as r:
                    r.raise_for_status()
                    data = r.json()
            except Exception:
                data = None

            if isinstance(data, dict):
                st = str(data.get("state") or "").strip().lower()
                reason = str(data.get("reason") or data.get("error") or "").strip() or None
                if st in ("arrived", "failed", "cancelled", "estop", "timeout"):
                    return NavProviderResult(state=st, reason=reason)
            time.sleep(poll_ms / 1000.0)


def build_nav_provider(config: dict) -> NavProvider:
    nav_cfg = get_nested(config, ["nav"], {}) or {}
    provider = str((nav_cfg.get("provider") or "disabled")).strip().lower() if isinstance(nav_cfg, dict) else "disabled"
    if provider == "mock":
        return MockNavProvider()
    if provider == "http":
        return HttpNavProvider()
    raise ValueError("nav_disabled")

