from __future__ import annotations

import json
import os
import urllib.parse
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file


def create_blueprint(deps):
    bp = Blueprint("offline_api", __name__)

    offline_root = (Path(deps.base_dir) / "data" / "offline").resolve()
    manifest_path = (offline_root / "manifest.json").resolve()
    audio_dir = (offline_root / "audio").resolve()

    def _load_manifest() -> dict:
        if not manifest_path.exists():
            return {"ok": False, "error": "offline_manifest_missing", "items": []}
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {"ok": False, "error": "offline_manifest_invalid", "items": []}
        except Exception as e:
            return {"ok": False, "error": "offline_manifest_load_failed", "detail": str(e), "items": []}

    def _safe_audio_path(filename: str) -> Path:
        fn = str(filename or "").replace("\\", "/").lstrip("/")
        if not fn or ".." in fn.split("/"):
            raise ValueError("bad_filename")
        p = (audio_dir / fn).resolve()
        if str(p).lower().startswith(str(audio_dir).lower() + os.sep.lower()) or str(p).lower() == str(audio_dir).lower():
            return p
        raise ValueError("path_outside_offline_audio_dir")

    @bp.route("/api/offline/manifest", methods=["GET"])
    def api_offline_manifest():
        raw = _load_manifest()
        base_url = str(request.host_url).rstrip("/")
        items = raw.get("items") if isinstance(raw, dict) else None
        if not isinstance(items, list):
            items = []

        out_items = []
        for idx, it in enumerate(items):
            if not isinstance(it, dict):
                continue
            item_id = str(it.get("id") or "").strip() or str(idx)
            audio_url = it.get("audio_url")
            if not audio_url:
                audio_url = f"{base_url}/api/offline/audio/{urllib.parse.quote(item_id)}"
            merged = dict(it)
            merged["id"] = item_id
            merged["audio_url"] = str(audio_url)
            out_items.append(merged)

        out = dict(raw) if isinstance(raw, dict) else {}
        out["items"] = out_items
        return jsonify(out)

    @bp.route("/api/offline/audio/<path:item_id>", methods=["GET"])
    def api_offline_audio(item_id: str):
        mid = str(item_id or "").strip()
        if not mid:
            return jsonify({"error": "item_id_required"}), 400

        manifest = _load_manifest()
        items = manifest.get("items") if isinstance(manifest, dict) else None
        filename = None
        if isinstance(items, list):
            for it in items:
                if not isinstance(it, dict):
                    continue
                if str(it.get("id") or "").strip() == mid:
                    filename = it.get("filename") or it.get("file") or it.get("path")
                    break

        if not filename:
            return jsonify({"error": "not_found"}), 404

        try:
            p = _safe_audio_path(str(filename))
        except Exception:
            return jsonify({"error": "bad_path"}), 400

        if not p.exists() or not p.is_file():
            return jsonify({"error": "audio_missing"}), 404
        return send_file(str(p), mimetype="audio/wav", conditional=True)

    return bp

