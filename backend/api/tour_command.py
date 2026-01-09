from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.api.request_context import get_client_id, get_request_id


def create_blueprint(deps):
    bp = Blueprint("tour_command_api", __name__)

    @bp.route("/api/tour/command/parse", methods=["POST"])
    def api_tour_command_parse():
        data = request.get_json() or {}
        text = str((data.get("text") or "")).strip()
        stops = data.get("stops")
        if not isinstance(stops, list):
            stops = []
        stops = [str(s).strip() for s in stops if str(s).strip()]

        request_id = get_request_id(request, data=data, prefix="tourcmd")
        client_id = get_client_id(request, data=data, default="-")

        cmd = deps.tour_command_service.parse(text=text, stops=stops)
        return jsonify(
            {
                "ok": True,
                "request_id": request_id,
                "client_id": client_id,
                "intent": cmd.intent,
                "action": cmd.action,
                "confidence": round(float(cmd.confidence), 3),
                "stop_index": cmd.stop_index,
                "stop_name": cmd.stop_name,
                "reason": cmd.reason,
            }
        )

    return bp

