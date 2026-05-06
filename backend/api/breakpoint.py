from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.api.request_context import get_client_id
from backend.services.breakpoint_store import BreakpointStoreError


def create_blueprint(deps):
    bp = Blueprint("breakpoint_api", __name__)

    @bp.route("/api/breakpoint", methods=["GET"])
    def get_breakpoint():
        client_id = get_client_id(request, default="-")
        kind = str((request.args.get("kind") or "tour")).strip() or "tour"
        try:
            rec = deps.breakpoint_store.get(kind=kind, client_id=client_id)
        except BreakpointStoreError:
            current_app.logger.exception("Failed to read breakpoint state")
            return jsonify({"ok": False, "error": "breakpoint_read_failed"}), 500
        if not rec:
            return jsonify({"ok": True, "kind": kind, "client_id": client_id, "state": None})
        return jsonify(
            {
                "ok": True,
                "kind": rec.kind,
                "client_id": rec.client_id,
                "state": rec.state,
                "created_at_ms": rec.created_at_ms,
                "updated_at_ms": rec.updated_at_ms,
            }
        )

    @bp.route("/api/breakpoint", methods=["POST"])
    def set_breakpoint():
        data = request.get_json() or {}
        client_id = get_client_id(request, data=data, default="-")
        kind = str((data.get("kind") or request.args.get("kind") or "tour")).strip() or "tour"
        state = data.get("state")
        if not isinstance(state, dict):
            return jsonify({"ok": False, "error": "state_dict_required"}), 400

        try:
            rec = deps.breakpoint_store.upsert(kind=kind, client_id=client_id, state=state)
        except BreakpointStoreError:
            current_app.logger.exception("Failed to save breakpoint state")
            return jsonify({"ok": False, "error": "breakpoint_save_failed"}), 500
        if not rec:
            return jsonify({"ok": False, "error": "save_failed"}), 500
        return jsonify({"ok": True, "kind": rec.kind, "client_id": rec.client_id, "state": rec.state, "updated_at_ms": rec.updated_at_ms})

    @bp.route("/api/breakpoint", methods=["DELETE"])
    def clear_breakpoint():
        client_id = get_client_id(request, default="-")
        kind = str((request.args.get("kind") or "tour")).strip() or "tour"
        try:
            deleted = bool(deps.breakpoint_store.clear(kind=kind, client_id=client_id))
        except BreakpointStoreError:
            current_app.logger.exception("Failed to delete breakpoint state")
            return jsonify({"ok": False, "error": "breakpoint_delete_failed"}), 500
        return jsonify({"ok": True, "kind": kind, "client_id": client_id, "deleted": deleted})

    return bp
