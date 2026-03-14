from __future__ import annotations

from flask import Blueprint, request

from backend.api.http_responses import bad_request_json, error_json, ok_json

GLOBAL_SCOPE_ID = "single_user"


def _get_unified_settings_record(deps):
    rec = deps.app_settings_store.get(scope_id=GLOBAL_SCOPE_ID)
    if rec:
        return rec
    latest = deps.app_settings_store.get_latest()
    if not latest:
        return None
    migrated = deps.app_settings_store.upsert(scope_id=GLOBAL_SCOPE_ID, settings=latest.settings)
    return migrated or latest


def create_blueprint(deps):
    bp = Blueprint("app_settings_api", __name__)

    @bp.route("/api/app_settings", methods=["GET"])
    def get_app_settings():
        rec = _get_unified_settings_record(deps)
        if not rec:
            return ok_json(scope_id=GLOBAL_SCOPE_ID, settings={}, created_at_ms=None, updated_at_ms=None)
        return ok_json(
            scope_id=rec.scope_id,
            settings=rec.settings,
            created_at_ms=rec.created_at_ms,
            updated_at_ms=rec.updated_at_ms,
        )

    @bp.route("/api/app_settings", methods=["PUT"])
    def put_app_settings():
        data = request.get_json(silent=True) or {}
        settings = data.get("settings")
        if not isinstance(settings, dict):
            return bad_request_json(error="settings_dict_required")

        rec = deps.app_settings_store.upsert(scope_id=GLOBAL_SCOPE_ID, settings=settings)
        if not rec:
            return error_json(error="save_failed", status=500)
        return ok_json(
            scope_id=rec.scope_id,
            settings=rec.settings,
            created_at_ms=rec.created_at_ms,
            updated_at_ms=rec.updated_at_ms,
        )

    return bp
