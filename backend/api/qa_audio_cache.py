from __future__ import annotations

from flask import Blueprint, jsonify, send_file


def _detect_audio_mimetype(path: str) -> str:
    with open(path, "rb") as f:
        head = bytes(f.read(16) or b"")
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"OggS"):
        return "audio/ogg"
    if head.startswith(b"fLaC"):
        return "audio/flac"
    if len(head) >= 3 and head[:3] == b"ID3":
        return "audio/mpeg"
    if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return "audio/mpeg"
    return "application/octet-stream"


def create_blueprint(deps):
    bp = Blueprint("qa_audio_cache_api", __name__)

    @bp.route("/api/qa_audio_cache/audio/<int:pair_id>", methods=["GET"])
    def get_qa_audio(pair_id: int):
        p = deps.qa_audio_cache_store.get_audio_file_path(pair_id=int(pair_id))
        if p is None:
            return jsonify({"error": "not_found"}), 404
        resp = send_file(str(p), mimetype=_detect_audio_mimetype(str(p)), conditional=True)
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp

    return bp
