from __future__ import annotations

import contextlib
import json
import time
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from backend.config.system_env import DiagnosticsEnvConfig
from backend.services.config_utils import get_nested
from backend.version import get_version


def redact_secrets(obj):
    if isinstance(obj, list):
        return [redact_secrets(x) for x in obj]
    if not isinstance(obj, dict):
        return obj
    out = {}
    for k, v in obj.items():
        key = str(k or "")
        low = key.lower()
        if any(s in low for s in ("api_key", "apikey", "token", "secret", "password")):
            out[key] = "***REDACTED***"
        else:
            out[key] = redact_secrets(v)
    return out


def diagnostics_authorized(req) -> bool:
    required = DiagnosticsEnvConfig.from_env().key
    if not required:
        return True
    supplied = str(req.headers.get("X-Diagnostics-Key") or req.args.get("key") or "").strip()
    return supplied == required


def load_openapi_or_default(*, base_dir: str | Path):
    path = (Path(base_dir) / "openapi.json").resolve()
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"openapi": "3.0.3", "info": {"title": "RagInt Backend API", "version": "0.0.0"}, "paths": {}}


def build_diagnostics_zip(*, deps, cfg_loader) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("version.json", json.dumps({"name": "ragint-backend", "version": get_version()}, ensure_ascii=False, indent=2))

        with contextlib.suppress(Exception):
            cfg = cfg_loader(deps=deps)
            z.writestr("config.json", json.dumps(redact_secrets(cfg), ensure_ascii=False, indent=2))

        with contextlib.suppress(Exception):
            z.writestr("events_recent.json", json.dumps({"items": deps.event_store.list_recent(limit=500)}, ensure_ascii=False, indent=2))

        with contextlib.suppress(Exception):
            path = (Path(deps.base_dir) / "openapi.json").resolve()
            if path.exists():
                z.write(str(path), arcname="openapi.json")
    buf.seek(0)
    return buf.getvalue()


def diagnostics_zip_response(payload: bytes):
    from flask import Response

    ts = int(time.time())
    return Response(
        payload,
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="ragint-diagnostics-{ts}.zip"'},
    )


@dataclass(frozen=True)
class EventQuery:
    request_id: str
    limit: int
    since_ms: int | None
    fmt: str


def parse_event_query(req) -> EventQuery:
    request_id = str((req.args.get("request_id") or req.headers.get("X-Request-ID") or "")).strip()
    try:
        limit = int(req.args.get("limit") or 200)
    except Exception:
        limit = 200
    try:
        since_ms = int(req.args.get("since_ms")) if req.args.get("since_ms") is not None else None
    except Exception:
        since_ms = None
    fmt = str((req.args.get("format") or "json")).strip().lower()
    return EventQuery(request_id=request_id, limit=limit, since_ms=since_ms, fmt=fmt)


def _dt_ms(a, b):
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return None
    return round((float(a) - float(b)) * 1000.0, 1)


def derive_status_metrics(*, timing: dict, now_perf: float) -> dict:
    t_submit = timing.get("t_submit")
    derived = {
        "submit_to_rag_first_chunk_ms": _dt_ms(timing.get("t_ragflow_first_chunk"), t_submit),
        "submit_to_rag_first_text_ms": _dt_ms(timing.get("t_ragflow_first_text"), t_submit),
        "submit_to_first_segment_ms": _dt_ms(timing.get("t_first_tts_segment"), t_submit),
        "submit_to_tts_first_audio_ms": _dt_ms(timing.get("t_tts_first_audio"), t_submit),
        "submit_to_play_end_ms": _dt_ms(timing.get("t_play_end"), t_submit),
        "now_since_submit_ms": _dt_ms(now_perf, t_submit),
    }
    return {k: v for k, v in derived.items() if v is not None}


def find_ask_context(*, event_store, request_id: str) -> dict:
    stop_id = None
    stop_name = None
    action_type = None
    with contextlib.suppress(Exception):
        for e in reversed(event_store.list_events(request_id=request_id, limit=200)):
            if e.get("name") != "ask_received":
                continue
            fields = e.get("fields") if isinstance(e.get("fields"), dict) else {}
            stop_id = fields.get("stop_id") or fields.get("stop_index")
            stop_name = fields.get("stop_name")
            action_type = fields.get("action_type")
            break
    return {"stop_id": stop_id, "stop_name": stop_name, "action_type": action_type}


def build_health_payload(*, deps, cfg_loader) -> dict:
    cfg = {}
    with contextlib.suppress(Exception):
        cfg = cfg_loader(deps=deps)
    key = str(get_nested(cfg, ["asr", "dashscope", "api_key"], "") or "").strip()
    if not key:
        key = str(get_nested(cfg, ["tts", "bailian", "api_key"], "") or "").strip()
    return {
        "asr_provider": "voicekit",
        "asr_api_key_configured": bool(key),
        "ragflow_connected": deps.session is not None,
    }
