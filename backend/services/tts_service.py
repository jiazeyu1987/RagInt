from __future__ import annotations

import logging
import threading
import time

from backend.services.tts.registry import stream_tts


class TTSSvc:
    def __init__(self, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._tts_state = {}
        self._tts_state_lock = threading.Lock()

    def _tts_state_prune(self, now_perf: float, ttl_s: float = 600.0, max_items: int = 500):
        with self._tts_state_lock:
            items = list(self._tts_state.items())
            for key, value in items:
                t_last = value.get("t_last")
                if isinstance(t_last, (int, float)) and (now_perf - float(t_last)) > ttl_s:
                    self._tts_state.pop(key, None)
            if len(self._tts_state) > max_items:
                ordered = sorted(
                    self._tts_state.items(),
                    key=lambda kv: float(kv[1].get("t_last", now_perf)),
                )
                for key, _ in ordered[: max(0, len(self._tts_state) - max_items)]:
                    self._tts_state.pop(key, None)

    def tts_state_update(self, request_id: str, segment_index, provider: str, endpoint: str):
        now_perf = time.perf_counter()
        self._tts_state_prune(now_perf)
        try:
            seg_int = int(segment_index) if segment_index is not None and str(segment_index).strip() != "" else None
        except Exception:
            seg_int = None

        with self._tts_state_lock:
            state = self._tts_state.get(request_id) or {
                "t_first": now_perf,
                "t_last": now_perf,
                "count": 0,
                "last_segment_index": None,
                "last_provider": None,
            }
            state["t_last"] = now_perf
            state["count"] = int(state.get("count", 0) or 0) + 1
            last_seg = state.get("last_segment_index", None)
            state["last_provider"] = provider

            warn = None
            if seg_int is not None and last_seg is not None:
                if seg_int == last_seg:
                    warn = "duplicate_segment_index"
                elif seg_int < last_seg:
                    warn = "out_of_order_segment_index"
                elif seg_int > last_seg + 1:
                    warn = "segment_index_gap"
            if seg_int is not None:
                state["last_segment_index"] = seg_int

            self._tts_state[request_id] = state

        if warn:
            self._logger.warning(
                f"[{request_id}] tts_order_warning type={warn} endpoint={endpoint} provider={provider} seg={seg_int} last={last_seg}"
            )
        else:
            self._logger.info(
                f"[{request_id}] tts_request_seen endpoint={endpoint} provider={provider} seg={seg_int} count={state['count']}"
            )

    def tts_state_get(self, request_id: str) -> dict | None:
        rid = str(request_id or "").strip()
        if not rid:
            return None
        now_perf = time.perf_counter()
        self._tts_state_prune(now_perf)
        with self._tts_state_lock:
            state = self._tts_state.get(rid)
            return dict(state) if isinstance(state, dict) else None

    def stream(
        self,
        *,
        text: str,
        request_id: str,
        config: dict,
        provider: str,
        endpoint: str,
        segment_index=None,
        cancel_event: threading.Event | None = None,
    ):
        provider_norm = (provider or "").strip().lower() or "local"
        self.tts_state_update(request_id, segment_index, provider_norm, endpoint)
        yield from stream_tts(
            text=text,
            request_id=request_id,
            config=config,
            provider=provider_norm,
            logger=self._logger,
            cancel_event=cancel_event,
            segment_index=segment_index,
            endpoint=endpoint,
        )

