from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.api.request_context import get_client_id


def create_blueprint(deps):
    bp = Blueprint("tour_control_api", __name__)

    @bp.route("/api/tour/control", methods=["GET"])
    def api_tour_control_get():
        client_id = get_client_id(request, default="-")
        try:
            since_id = int(request.args.get("since_id") or 0)
        except Exception:
            since_id = 0
        try:
            limit = int(request.args.get("limit") or 50)
        except Exception:
            limit = 50

        state = deps.tour_control_store.get_state(client_id=client_id)
        effective_status = deps.tour_control_store.get_effective_status(client_id=client_id)
        queue_depth = deps.tour_control_store.get_queue_depth(client_id=client_id)
        commands = deps.tour_control_store.list_commands(client_id=client_id, since_id=since_id, limit=limit)
        return jsonify(
            {
                "ok": True,
                "client_id": client_id,
                "state": (
                    None
                    if not state
                    else {
                        "status": effective_status,
                        "queue_depth": int(queue_depth),
                        "paused": bool(state.paused),
                        "speed": float(state.speed),
                        "updated_at_ms": int(state.updated_at_ms),
                    }
                ),
                "commands": [
                    {
                        "id": int(c.id),
                        "action": c.action,
                        "payload": c.payload,
                        "created_at_ms": int(c.created_at_ms),
                        "consumed_at_ms": c.consumed_at_ms,
                    }
                    for c in commands
                ],
            }
        )

    @bp.route("/api/tour/control", methods=["POST"])
    def api_tour_control_post():
        data = request.get_json() or {}
        client_id = get_client_id(request, data=data, default="-")
        action = str((data.get("action") or "")).strip().lower()
        payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
        if not action:
            return jsonify({"ok": False, "error": "action_required"}), 400

        cid = deps.tour_control_store.add_command(client_id=client_id, action=action, payload=payload)
        if not cid:
            return jsonify({"ok": False, "error": "save_failed"}), 500

        deps.event_store.emit(request_id=f"tourctl_{cid}", client_id=client_id, kind="tour_control", name="tour_control", action=action)
        return jsonify({"ok": True, "client_id": client_id, "command_id": int(cid)})

    @bp.route("/api/tour/control/consume", methods=["POST"])
    def api_tour_control_consume():
        data = request.get_json() or {}
        client_id = get_client_id(request, data=data, default="-")
        command_id = data.get("command_id")
        try:
            command_id = int(command_id)
        except Exception:
            command_id = 0
        if command_id <= 0:
            return jsonify({"ok": False, "error": "command_id_required"}), 400
        ok = bool(deps.tour_control_store.consume(client_id=client_id, command_id=command_id))
        return jsonify({"ok": True, "client_id": client_id, "command_id": command_id, "consumed": ok})

    return bp
