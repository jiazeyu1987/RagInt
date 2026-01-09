from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
import time
import zipfile
from io import BytesIO

from flask import Blueprint, Response, jsonify, request

from backend.version import get_version


def create_blueprint(deps):
    bp = Blueprint("system_api", __name__)

    @bp.route("/api/openapi.json", methods=["GET"])
    def api_openapi():
        path = (Path(deps.base_dir) / "openapi.json").resolve()
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {"openapi": "3.0.3", "info": {"title": "RagInt Backend API", "version": "0.0.0"}, "paths": {}}
        return jsonify(data)

    @bp.route("/api/version", methods=["GET"])
    def api_version():
        return jsonify(
            {
                "name": "ragint-backend",
                "version": get_version(),
            }
        )

    def _redact(obj):
        if isinstance(obj, list):
            return [_redact(x) for x in obj]
        if not isinstance(obj, dict):
            return obj
        out = {}
        for k, v in obj.items():
            key = str(k or "")
            low = key.lower()
            if any(s in low for s in ("api_key", "apikey", "token", "secret", "password")):
                out[key] = "***REDACTED***"
            else:
                out[key] = _redact(v)
        return out

    def _diagnostics_authorized() -> bool:
        required = str(os.environ.get("RAGINT_DIAGNOSTICS_KEY") or "").strip()
        if not required:
            return True
        supplied = str(request.headers.get("X-Diagnostics-Key") or request.args.get("key") or "").strip()
        return supplied == required

    @bp.route("/api/diagnostics", methods=["GET"])
    def api_diagnostics():
        if not _diagnostics_authorized():
            return jsonify({"ok": False, "error": "forbidden"}), 403

        buf = BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("version.json", json.dumps({"name": "ragint-backend", "version": get_version()}, ensure_ascii=False, indent=2))

            with contextlib.suppress(Exception):
                cfg = deps.ragflow_service.load_config() or {}
                z.writestr("config.json", json.dumps(_redact(cfg), ensure_ascii=False, indent=2))

            with contextlib.suppress(Exception):
                z.writestr(
                    "events_recent.json",
                    json.dumps({"items": deps.event_store.list_recent(limit=500)}, ensure_ascii=False, indent=2),
                )

            with contextlib.suppress(Exception):
                path = (Path(deps.base_dir) / "openapi.json").resolve()
                if path.exists():
                    z.write(str(path), arcname="openapi.json")

        buf.seek(0)
        ts = int(time.time())
        return Response(
            buf.getvalue(),
            mimetype="application/zip",
            headers={"Content-Disposition": f'attachment; filename="ragint-diagnostics-{ts}.zip"'},
        )

    @bp.route("/api/events", methods=["GET"])
    def api_events():
        request_id = str((request.args.get("request_id") or request.headers.get("X-Request-ID") or "")).strip()
        try:
            limit = int(request.args.get("limit") or 200)
        except Exception:
            limit = 200
        try:
            since_ms = int(request.args.get("since_ms")) if request.args.get("since_ms") is not None else None
        except Exception:
            since_ms = None

        fmt = str((request.args.get("format") or "json")).strip().lower()

        if request_id:
            items = deps.event_store.list_events(request_id=request_id, limit=limit, since_ms=since_ms)
            last_error = deps.event_store.last_error(request_id=request_id)
        else:
            items = deps.event_store.list_recent(limit=limit, since_ms=since_ms)
            last_error = None

        if fmt in ("ndjson", "jsonl"):
            body = "\n".join(json.dumps(it, ensure_ascii=False) for it in items) + ("\n" if items else "")
            return Response(body, mimetype="application/x-ndjson", headers={"Cache-Control": "no-cache"})

        return jsonify({"request_id": request_id or None, "items": items, "last_error": last_error})

    @bp.route("/api/client_events", methods=["POST"])
    def api_client_events():
        """
        Frontend -> backend event ingest for observability.
        Used for client-only timeline points like playback end and nav UI state.
        """
        data = request.get_json() or {}
        request_id = str((data.get("request_id") or data.get("rid") or request.headers.get("X-Request-ID") or "")).strip()
        client_id = str((data.get("client_id") or data.get("cid") or request.headers.get("X-Client-ID") or "")).strip() or "-"
        kind = str((data.get("kind") or "client")).strip() or "client"
        name = str((data.get("name") or data.get("event") or "")).strip()
        level = str((data.get("level") or "info")).strip() or "info"
        fields = data.get("fields") if isinstance(data.get("fields"), dict) else {}
        if not request_id or not name:
            return jsonify({"ok": False, "error": "request_id_and_name_required"}), 400

        with contextlib.suppress(Exception):
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind=kind,
                name=name,
                level=level,
                **(fields or {}),
            )

        with contextlib.suppress(Exception):
            now_perf = time.perf_counter()
            if name in ("play_end", "tts_play_end", "playback_end"):
                deps.ask_timings.set(request_id, t_play_end=now_perf)

        return jsonify({"ok": True})

    @bp.route("/api/status", methods=["GET"])
    def api_status():
        request_id = str((request.args.get("request_id") or request.headers.get("X-Request-ID") or "")).strip()
        if not request_id:
            return jsonify({"error": "request_id_required"}), 400

        now = time.perf_counter()
        timing = deps.ask_timings.get(request_id) or {}
        cancel_info = deps.request_registry.get_info(request_id) or {}
        cancelled = bool(cancel_info.get("canceled_at")) or deps.request_registry.is_cancelled(request_id)
        tts_state = deps.tts_service.tts_state_get(request_id) or {}

        def _dt(a, b):
            if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
                return None
            return round((float(a) - float(b)) * 1000.0, 1)

        t_submit = timing.get("t_submit")
        t_rag_first_chunk = timing.get("t_ragflow_first_chunk")
        t_rag_first_text = timing.get("t_ragflow_first_text")
        t_first_seg = timing.get("t_first_tts_segment")
        t_tts_first_audio = timing.get("t_tts_first_audio")
        t_play_end = timing.get("t_play_end")

        derived = {
            "submit_to_rag_first_chunk_ms": _dt(t_rag_first_chunk, t_submit),
            "submit_to_rag_first_text_ms": _dt(t_rag_first_text, t_submit),
            "submit_to_first_segment_ms": _dt(t_first_seg, t_submit),
            "submit_to_tts_first_audio_ms": _dt(t_tts_first_audio, t_submit),
            "submit_to_play_end_ms": _dt(t_play_end, t_submit),
            "now_since_submit_ms": _dt(now, t_submit),
        }
        derived = {k: v for k, v in derived.items() if v is not None}

        stop_id = None
        stop_name = None
        action_type = None
        with contextlib.suppress(Exception):
            for e in reversed(deps.event_store.list_events(request_id=request_id, limit=200)):
                if e.get("name") != "ask_received":
                    continue
                f = e.get("fields") if isinstance(e.get("fields"), dict) else {}
                stop_id = f.get("stop_id") or f.get("stop_index")
                stop_name = f.get("stop_name")
                action_type = f.get("action_type")
                break

        return jsonify(
            {
                "request_id": request_id,
                "cancelled": cancelled,
                "cancel": cancel_info,
                "timing": timing,
                "derived_ms": derived,
                "tts_state": tts_state,
                "last_error": deps.event_store.last_error(request_id=request_id),
                "context": {"stop_id": stop_id, "stop_name": stop_name, "action_type": action_type},
            }
        )

    @bp.route("/health", methods=["GET"])
    def health():
        return jsonify({"asr_loaded": deps.asr_service.funasr_loaded, "ragflow_connected": deps.session is not None})

    return bp
