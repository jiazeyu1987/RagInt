from __future__ import annotations

import json
import os
import urllib.parse
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file


class OfflineManifestError(RuntimeError):
    def __init__(self, status_code: int, error: str, detail: str | None = None):
        super().__init__(error)
        self.status_code = status_code
        self.error = error
        self.detail = detail

    def to_response(self):
        body = {"ok": False, "error": self.error}
        if self.detail:
            body["detail"] = self.detail
        return jsonify(body), self.status_code


def create_blueprint(deps):
    bp = Blueprint("offline_api", __name__)

    offline_root = (Path(deps.runtime_data_dir) / "offline").resolve()
    manifest_path = (offline_root / "manifest.json").resolve()
    audio_dir = (offline_root / "audio").resolve()

    def _load_manifest() -> dict:
        if not manifest_path.exists():
            raise OfflineManifestError(503, "offline_manifest_missing")
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise OfflineManifestError(500, "offline_manifest_load_failed", str(e)) from e
        except OSError as e:
            raise OfflineManifestError(503, "offline_manifest_load_failed", str(e)) from e
        if not isinstance(data, dict):
            raise OfflineManifestError(500, "offline_manifest_invalid")
        items = data.get("items")
        if not isinstance(items, list):
            raise OfflineManifestError(500, "offline_manifest_invalid")
        for item in items:
            _validate_manifest_item(item)
        return data

    def _validate_manifest_item(item) -> None:
        if not isinstance(item, dict):
            raise OfflineManifestError(500, "offline_manifest_invalid")
        item_id = str(item.get("id") or "").strip()
        filename = str(item.get("filename") or "").strip()
        if not item_id or not filename:
            raise OfflineManifestError(500, "offline_manifest_invalid")
        for field in ("order", "duration_ms"):
            value = item.get(field, None)
            if value is None:
                continue
            try:
                int(value)
            except (TypeError, ValueError) as exc:
                raise OfflineManifestError(500, "offline_manifest_invalid") from exc

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
        try:
            raw = _load_manifest()
        except OfflineManifestError as e:
            return e.to_response()
        base_url = str(request.host_url).rstrip("/")
        items = raw["items"]

        out_items = []
        for it in items:
            item_id = str(it.get("id") or "").strip()
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

        try:
            manifest = _load_manifest()
        except OfflineManifestError as e:
            return e.to_response()
        items = manifest.get("items")
        filename = None
        if isinstance(items, list):
            for it in items:
                if str(it.get("id") or "").strip() == mid:
                    filename = it.get("filename")
                    break

        if not filename:
            return jsonify({"error": "not_found"}), 404

        try:
            p = _safe_audio_path(str(filename))
        except ValueError:
            return jsonify({"error": "bad_path"}), 400

        if not p.exists() or not p.is_file():
            return jsonify({"error": "audio_missing"}), 404
        return send_file(str(p), mimetype="audio/wav", conditional=True)

    return bp
