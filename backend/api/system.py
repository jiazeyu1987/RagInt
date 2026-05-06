from __future__ import annotations

import json
from json import JSONDecodeError

from flask import Blueprint, Response, jsonify, request

from backend.api.http_responses import bad_request_json, error_json, ok_json
from backend.version import get_version
from backend.api.ragflow_config_cache import get_ragflow_config
from backend.api.system_events import build_status_payload, ingest_client_event, parse_client_event, parse_status_request_id
from backend.api.system_utils import (
    build_diagnostics_zip,
    build_health_payload,
    diagnostics_authorized,
    diagnostics_zip_response,
    load_openapi_or_default,
    parse_event_query,
)


def create_blueprint(deps):
    bp = Blueprint("system_api", __name__)

    @bp.route("/api/openapi.json", methods=["GET"])
    def api_openapi():
        try:
            data = load_openapi_or_default(base_dir=deps.base_dir)
        except FileNotFoundError:
            return error_json(error="openapi_spec_required", status=500)
        except JSONDecodeError as exc:
            return error_json(error="openapi_spec_invalid", detail=str(exc), status=500)
        return jsonify(data)

    @bp.route("/api/version", methods=["GET"])
    def api_version():
        return jsonify(
            {
                "name": "ragint-backend",
                "version": get_version(),
            }
        )

    @bp.route("/api/diagnostics", methods=["GET"])
    def api_diagnostics():
        if not diagnostics_authorized(request):
            return error_json(error="forbidden", status=403)
        payload = build_diagnostics_zip(deps=deps, cfg_loader=get_ragflow_config)
        return diagnostics_zip_response(payload)

    @bp.route("/api/events", methods=["GET"])
    def api_events():
        try:
            q = parse_event_query(request)
        except ValueError as exc:
            return bad_request_json(error=str(exc))
        if q.request_id:
            items = deps.event_store.list_events(request_id=q.request_id, limit=q.limit, since_ms=q.since_ms)
            last_error = deps.event_store.last_error(request_id=q.request_id)
        else:
            items = deps.event_store.list_recent(limit=q.limit, since_ms=q.since_ms)
            last_error = None

        if q.fmt in ("ndjson", "jsonl"):
            body = "\n".join(json.dumps(it, ensure_ascii=False) for it in items) + ("\n" if items else "")
            return Response(body, mimetype="application/x-ndjson", headers={"Cache-Control": "no-cache"})

        return jsonify({"request_id": q.request_id or None, "items": items, "last_error": last_error})

    @bp.route("/api/client_events", methods=["POST"])
    def api_client_events():
        """
        Frontend -> backend event ingest for observability.
        Used for client-only timeline points like playback end and nav UI state.
        """
        event = parse_client_event(req=request, data=(request.get_json() or {}))
        if not ingest_client_event(deps=deps, event=event):
            if event.request_id and event.name:
                return error_json(error="client_event_ingest_failed", status=500)
            return bad_request_json(error="request_id_and_name_required")
        return ok_json()

    @bp.route("/api/status", methods=["GET"])
    def api_status():
        request_id = parse_status_request_id(request)
        if not request_id:
            return jsonify({"error": "request_id_required"}), 400
        return jsonify(build_status_payload(deps=deps, request_id=request_id))

    @bp.route("/health", methods=["GET"])
    def health():
        return jsonify(build_health_payload(deps=deps, cfg_loader=get_ragflow_config))

    return bp
