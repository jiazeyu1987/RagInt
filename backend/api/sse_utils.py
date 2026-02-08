from __future__ import annotations

import json
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class SSEEncoder:
    request_id: str
    t_submit: float

    def event(self, payload: dict) -> str:
        payload.setdefault("request_id", self.request_id)
        payload.setdefault("t_ms", int((time.perf_counter() - self.t_submit) * 1000))
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

