from __future__ import annotations

import time
from dataclasses import dataclass

from backend.orchestrators.stream_payloads import classify_text_event


@dataclass
class AskStreamTelemetry:
    event_store: object
    ask_timings: object
    request_id: str
    client_id: str
    _seen_first_text: bool = False
    _seen_first_segment: bool = False

    def on_payload(self, payload: object) -> None:
        if not isinstance(payload, dict):
            return

        kind, text = classify_text_event(payload)
        if not self._seen_first_text and kind == "chunk":
            self.ask_timings.set(self.request_id, t_ragflow_first_text=time.perf_counter())
            self.event_store.emit(
                request_id=self.request_id,
                client_id=self.client_id,
                kind="ask",
                name="rag_first_text",
                chars=len(str(text or "")),
            )
            self._seen_first_text = True

        if not self._seen_first_segment and kind == "segment":
            seg = str(text or "")
            self.event_store.emit(
                request_id=self.request_id,
                client_id=self.client_id,
                kind="ask",
                name="first_tts_segment",
                chars=len(seg),
                segment_seq=payload.get("segment_seq"),
            )
            self._seen_first_segment = True
