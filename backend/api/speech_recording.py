from __future__ import annotations

from dataclasses import dataclass

from backend.orchestrators.stream_payloads import classify_text_event


@dataclass
class AskRecordingSink:
    recording_store: object
    recording_id: str | None
    stop_index: int | None
    tour_action: str | None
    request_id: str

    def enabled(self) -> bool:
        return bool(self.recording_id) and self.stop_index is not None and bool(self.tour_action)

    def on_payload(self, payload: object) -> None:
        if not self.enabled() or not isinstance(payload, dict):
            return

        kind, text = classify_text_event(payload)
        if kind == "done":
            self.recording_store.add_ask_event(
                recording_id=self.recording_id,
                stop_index=int(self.stop_index),
                request_id=self.request_id,
                kind="done",
                text=None,
            )
            return

        if kind == "segment":
            self.recording_store.add_ask_event(
                recording_id=self.recording_id,
                stop_index=int(self.stop_index),
                request_id=self.request_id,
                kind="segment",
                text=str(text or ""),
            )
            return

        if kind == "chunk":
            self.recording_store.add_ask_event(
                recording_id=self.recording_id,
                stop_index=int(self.stop_index),
                request_id=self.request_id,
                kind="chunk",
                text=str(text or ""),
            )
