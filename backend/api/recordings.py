from __future__ import annotations

import time

from flask import Blueprint, jsonify, request, send_file


def create_blueprint(deps):
    bp = Blueprint("recordings_api", __name__)

    @bp.route("/api/recordings", methods=["GET"])
    def list_recordings():
        limit = request.args.get("limit", 50)
        try:
            limit = int(limit)
        except Exception:
            limit = 50
        items = deps.recording_store.list(limit=limit)
        return jsonify({"items": items})

    @bp.route("/api/recordings/start", methods=["POST"])
    def start_recording():
        data = request.get_json(silent=True) or {}
        stops = data.get("stops") or []
        if not isinstance(stops, list) or not stops:
            return jsonify({"error": "stops_required"}), 400
        rid = str(data.get("recording_id") or "").strip() or f"rec_{int(time.time()*1000)}"
        info = deps.recording_store.create(recording_id=rid, stops=[str(s or "").strip() for s in stops if str(s or "").strip()])
        return jsonify({"recording_id": info.recording_id, "created_at_ms": info.created_at_ms})

    @bp.route("/api/recordings/<recording_id>/finish", methods=["POST"])
    def finish_recording(recording_id: str):
        deps.recording_store.finish(recording_id)
        return jsonify({"ok": True})

    @bp.route("/api/recordings/<recording_id>", methods=["GET"])
    def get_recording(recording_id: str):
        meta = deps.recording_store.get(recording_id)
        if not meta:
            return jsonify({"error": "not_found"}), 404
        return jsonify(meta)

    @bp.route("/api/recordings/<recording_id>/rename", methods=["POST"])
    def rename_recording(recording_id: str):
        data = request.get_json(silent=True) or {}
        name = str((data.get("display_name") or data.get("name") or "")).strip()
        try:
            deps.recording_store.set_display_name(recording_id, name)
            return jsonify({"ok": True, "recording_id": str(recording_id), "display_name": name})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @bp.route("/api/recordings/<recording_id>", methods=["DELETE"])
    def delete_recording(recording_id: str):
        try:
            deps.recording_store.delete(recording_id)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @bp.route("/api/recordings/<recording_id>/stop/<int:stop_index>", methods=["GET"])
    def get_recording_stop(recording_id: str, stop_index: int):
        base_url = str(request.host_url).rstrip("/")
        payload = deps.recording_store.get_stop_payload(recording_id=recording_id, stop_index=int(stop_index), base_url=base_url)
        if not payload:
            return jsonify({"error": "not_found"}), 404
        return jsonify(payload)

    @bp.route("/api/recordings/<recording_id>/audio/<path:filename>", methods=["GET"])
    def get_recording_audio(recording_id: str, filename: str):
        try:
            path = deps.recording_store.safe_rel_audio_path(recording_id, filename)
            path = deps.recording_store.ensure_within_audio_dir(recording_id, path)
        except Exception:
            return jsonify({"error": "bad_path"}), 400
        if not path.exists() or not path.is_file():
            return jsonify({"error": "not_found"}), 404
        return send_file(str(path), mimetype="audio/wav", conditional=True)

    return bp
