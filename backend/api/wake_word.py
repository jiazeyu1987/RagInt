from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.api.request_context import get_client_id, get_request_id
from backend.services.wake_word_service import parse_wake_words


def create_blueprint(deps):
    bp = Blueprint("wake_word_api", __name__)

    @bp.route("/api/wake_word/detect", methods=["POST"])
    def api_wake_word_detect():
        data = request.get_json() or {}
        text = str((data.get("text") or "")).strip()
        request_id = get_request_id(request, data=data, prefix="wake")
        client_id = get_client_id(request, data=data, default="-")

        wake_words = data.get("wake_words")
        if isinstance(wake_words, str):
            wake_words = parse_wake_words(wake_words)
        if not isinstance(wake_words, list):
            wake_words = None

        cooldown_ms = data.get("cooldown_ms")
        try:
            cooldown_ms = int(cooldown_ms) if cooldown_ms is not None else None
        except Exception:
            cooldown_ms = None

        match_mode = str((data.get("match_mode") or "")).strip().lower() or None

        res = deps.wake_word_service.detect(
            text=text,
            client_id=client_id,
            wake_words=wake_words,
            cooldown_ms=cooldown_ms,
            match_mode=match_mode,
        )
        if res.detected:
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="wake",
                name="wake_word_detected",
                wake_word=res.wake_word,
            )
        elif res.cooldown_ms_remaining > 0:
            deps.event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="wake",
                name="wake_word_cooldown",
                cooldown_ms_remaining=res.cooldown_ms_remaining,
            )

        return jsonify(
            {
                "ok": True,
                "request_id": request_id,
                "client_id": client_id,
                "detected": res.detected,
                "wake_word": res.wake_word,
                "cooldown_ms_remaining": res.cooldown_ms_remaining,
                "reason": res.reason,
            }
        )

    return bp
