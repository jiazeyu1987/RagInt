from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.api.request_context import get_client_id


def _is_allowed(value, allowed: set[str]) -> bool:
    return str(value or "").strip().lower() in allowed


def _compute_default_topn(*, duration_s: int | None, profile: str | None) -> int:
    try:
        d = int(duration_s) if duration_s is not None else None
    except (TypeError, ValueError):
        raise ValueError("duration_s_invalid") from None
    p = str(profile or "").strip()
    if d is None:
        base = 3
    elif d <= 35:
        base = 2
    elif d <= 90:
        base = 3
    else:
        base = 5
    if p in ("专业", "pro", "professional"):
        base += 1
    return max(1, min(base, 8))


def create_blueprint(deps):
    bp = Blueprint("selling_points_api", __name__)

    @bp.route("/api/selling_points", methods=["GET"])
    def api_list_points():
        stop_name = str((request.args.get("stop_name") or request.args.get("stop") or "")).strip()
        status = request.args.get("status")
        if status is None:
            status = "published"
        max_level = request.args.get("max_level")
        try:
            limit = int(request.args.get("limit") or 50)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "invalid_query_parameter", "field": "limit"}), 400
        if status is not None and not _is_allowed(status, {"draft", "review", "published"}):
            return jsonify({"ok": False, "error": "invalid_query_parameter", "field": "status"}), 400
        if max_level is not None and not _is_allowed(max_level, {"public", "internal", "sensitive"}):
            return jsonify({"ok": False, "error": "invalid_query_parameter", "field": "max_level"}), 400
        try:
            pts = deps.selling_points_store.list(stop_name=stop_name, limit=limit, status=status, max_level=max_level)
        except ValueError as exc:
            return jsonify({"ok": False, "error": "selling_points_read_failed", "detail": str(exc)}), 500
        return jsonify(
            {
                "ok": True,
                "stop_name": stop_name,
                "items": [
                    {
                        "text": p.text,
                        "weight": p.weight,
                        "tags": list(p.tags),
                        "level": p.level,
                        "status": p.status,
                        "updated_at_ms": p.updated_at_ms,
                    }
                    for p in pts
                ],
            }
        )

    @bp.route("/api/selling_points", methods=["POST"])
    def api_upsert_point():
        data = request.get_json() or {}
        stop_name = str((data.get("stop_name") or data.get("stop") or "")).strip()
        text = str((data.get("text") or "")).strip()
        weight = data["weight"] if "weight" in data else 0
        tags = data.get("tags")
        level = data.get("level")
        status = data.get("status")
        if not isinstance(tags, list):
            if tags is not None:
                return jsonify({"ok": False, "error": "tags_list_required"}), 400
            tags = []

        try:
            ok = deps.selling_points_store.upsert(stop_name=stop_name, text=text, weight=weight, tags=tags, level=level, status=status)
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        if not ok:
            return jsonify({"ok": False, "error": "invalid_input"}), 400

        # lightweight observability
        client_id = get_client_id(request, data=data, default="-")
        deps.event_store.emit(request_id=f"sp_{stop_name}", client_id=client_id, kind="selling_points", name="selling_point_upsert", stop_name=stop_name)
        return jsonify({"ok": True})

    @bp.route("/api/selling_points/workflow", methods=["POST"])
    def api_selling_points_workflow():
        data = request.get_json() or {}
        stop_name = str((data.get("stop_name") or data.get("stop") or "")).strip()
        text = str((data.get("text") or "")).strip()
        action = str((data.get("action") or "")).strip().lower()
        if not stop_name or not text or not action:
            return jsonify({"ok": False, "error": "invalid_input"}), 400

        new_status = deps.selling_points_store.transition_status(stop_name=stop_name, text=text, action=action)
        if not new_status:
            return jsonify({"ok": False, "error": "transition_failed"}), 400

        client_id = get_client_id(request, data=data, default="-")
        deps.event_store.emit(
            request_id=f"spwf_{stop_name}",
            client_id=client_id,
            kind="selling_points",
            name="selling_point_workflow",
            stop_name=stop_name,
            action=action,
            status=new_status,
        )
        return jsonify({"ok": True, "stop_name": stop_name, "text": text, "status": new_status})

    @bp.route("/api/selling_points", methods=["DELETE"])
    def api_delete_point():
        data = request.get_json(silent=True) or {}
        stop_name = str((data.get("stop_name") or request.args.get("stop_name") or request.args.get("stop") or "")).strip()
        text = str((data.get("text") or request.args.get("text") or "")).strip()
        deleted = bool(deps.selling_points_store.delete(stop_name=stop_name, text=text))
        return jsonify({"ok": True, "deleted": deleted})

    @bp.route("/api/selling_points/topn", methods=["GET"])
    def api_topn_points():
        stop_name = str((request.args.get("stop_name") or request.args.get("stop") or "")).strip()
        profile = request.args.get("profile")
        duration_s = request.args.get("duration_s")
        max_level = request.args.get("max_level")
        try:
            n = int(request.args.get("n")) if request.args.get("n") is not None else None
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "invalid_query_parameter", "field": "n"}), 400
        if max_level is not None and not _is_allowed(max_level, {"public", "internal", "sensitive"}):
            return jsonify({"ok": False, "error": "invalid_query_parameter", "field": "max_level"}), 400
        if n is None:
            try:
                n = _compute_default_topn(duration_s=duration_s, profile=profile)
            except ValueError as exc:
                return jsonify({"ok": False, "error": str(exc)}), 400

        try:
            pts = deps.selling_points_store.list(stop_name=stop_name, limit=max(50, n), status="published", max_level=max_level)
            picked = deps.selling_points_store.pick_topn(points=pts, n=int(n))
        except ValueError as exc:
            return jsonify({"ok": False, "error": "selling_points_read_failed", "detail": str(exc)}), 500
        return jsonify(
            {
                "ok": True,
                "stop_name": stop_name,
                "n": int(n),
                "items": [
                    {"text": p.text, "weight": p.weight, "tags": list(p.tags), "level": p.level, "status": p.status, "updated_at_ms": p.updated_at_ms}
                    for p in picked
                ],
            }
        )

    return bp
