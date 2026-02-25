from __future__ import annotations

from flask import Blueprint, jsonify, send_file


def create_blueprint(deps):
    bp = Blueprint("qa_audio_cache_api", __name__)

    @bp.route("/api/qa_audio_cache/audio/<int:pair_id>", methods=["GET"])
    def get_qa_audio(pair_id: int):
        try:
            p = deps.qa_audio_cache_store.get_audio_file_path(pair_id=int(pair_id))
        except Exception:
            p = None
        if p is None:
            return jsonify({"error": "not_found"}), 404
        resp = send_file(str(p), mimetype="audio/wav", conditional=True)
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp

    return bp
