from __future__ import annotations

import os
import re
import threading
import time

from flask import Blueprint, jsonify, request, send_file
from werkzeug.exceptions import BadRequest

from backend.api.ragflow_config_cache import get_ragflow_config
from backend.config import resolve_tts_request
from backend.services.audio_utils import ensure_wav_bytes


def _guess_sample_rate(*, resolved_cfg: dict, provider: str) -> int:
    if not isinstance(resolved_cfg, dict):
        raise ValueError("tts_config_invalid")
    cfg = resolved_cfg
    p = str(provider or "").strip().lower()

    if p in ("modelscope", "bailian", "dashscope", "flash"):
        sr = (((cfg.get("tts") or {}).get("bailian") or {}).get("sample_rate"))
        if sr is None or str(sr).strip() == "":
            raise ValueError("tts_sample_rate_missing")
        return max(8000, int(sr))

    if p == "edge":
        fmt = str((((cfg.get("tts") or {}).get("edge") or {}).get("output_format") or "")).strip().lower()
        m = re.search(r"(\d+)\s*khz", fmt)
        if not m:
            raise ValueError("tts_edge_output_format_sample_rate_missing")
        return max(8000, int(m.group(1)) * 1000)

    raise ValueError("tts_provider_sample_rate_unsupported")


def _file_part(value: str, *, field: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError(f"{field}_empty")
    out = re.sub(r"[^a-zA-Z0-9._-]+", "_", raw).strip("._")
    if not out:
        raise ValueError(f"{field}_safe_part_empty")
    return out


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

    ext = str(os.path.splitext(str(path))[1] or "").strip().lower()
    if ext in (".wav", ".wave"):
        return "audio/wav"
    if ext == ".mp3":
        return "audio/mpeg"
    if ext == ".ogg":
        return "audio/ogg"
    if ext == ".flac":
        return "audio/flac"
    return "application/octet-stream"


def create_blueprint(deps):
    bp = Blueprint("recordings_api", __name__)

    @bp.route("/api/recordings", methods=["GET"])
    def list_recordings():
        limit = request.args.get("limit", 50)
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_limit"}), 400
        items = deps.recording_store.list(limit=limit)
        return jsonify({"items": items})

    @bp.route("/api/recordings/start", methods=["POST"])
    def start_recording():
        try:
            data = request.get_json(silent=False) or {}
        except BadRequest:
            return jsonify({"error": "invalid_json"}), 400
        if not isinstance(data, dict):
            return jsonify({"error": "json_object_required"}), 400
        stops = data.get("stops") or []
        if not isinstance(stops, list) or not stops:
            return jsonify({"error": "stops_required"}), 400
        cleaned_stops = [str(s or "").strip() for s in stops if str(s or "").strip()]
        if not cleaned_stops:
            return jsonify({"error": "stops_required"}), 400
        rid = str(data.get("recording_id") or "").strip() or f"rec_{int(time.time()*1000)}"
        raw_meta = data.get("metadata")
        metadata = raw_meta if isinstance(raw_meta, dict) else {}
        info = deps.recording_store.create(
            recording_id=rid,
            stops=cleaned_stops,
            metadata=metadata,
        )
        return jsonify(
            {
                "recording_id": info.recording_id,
                "created_at_ms": info.created_at_ms,
                "metadata": info.metadata,
            }
        )

    @bp.route("/api/recordings/<recording_id>/finish", methods=["POST"])
    def finish_recording(recording_id: str):
        if not deps.recording_store.get(recording_id):
            return jsonify({"ok": False, "error": "not_found"}), 404
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
        try:
            data = request.get_json(silent=False) or {}
        except BadRequest:
            return jsonify({"ok": False, "error": "invalid_json"}), 400
        if not isinstance(data, dict):
            return jsonify({"ok": False, "error": "json_object_required"}), 400
        name = str((data.get("display_name") or data.get("name") or "")).strip()
        if not deps.recording_store.get(recording_id):
            return jsonify({"ok": False, "error": "not_found"}), 404
        try:
            deps.recording_store.set_display_name(recording_id, name)
            return jsonify({"ok": True, "recording_id": str(recording_id), "display_name": name})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @bp.route("/api/recordings/<recording_id>", methods=["DELETE"])
    def delete_recording(recording_id: str):
        if not deps.recording_store.get(recording_id):
            return jsonify({"ok": False, "error": "not_found"}), 404
        try:
            deps.recording_store.delete(recording_id)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @bp.route("/api/recordings/<recording_id>/stop/<int:stop_index>", methods=["GET"])
    def get_recording_stop(recording_id: str, stop_index: int):
        payload = deps.recording_store.get_stop_payload(recording_id=recording_id, stop_index=int(stop_index), base_url="")
        if not payload:
            return jsonify({"error": "not_found"}), 404
        return jsonify(payload)

    @bp.route("/api/recordings/<recording_id>/audio/<path:filename>", methods=["GET"])
    def get_recording_audio(recording_id: str, filename: str):
        try:
            path = deps.recording_store.safe_rel_audio_path(recording_id, filename)
            path = deps.recording_store.ensure_within_audio_dir(recording_id, path)
        except ValueError:
            return jsonify({"error": "bad_path"}), 400
        if not path.exists() or not path.is_file():
            return jsonify({"error": "not_found"}), 404
        mimetype = _detect_audio_mimetype(str(path))
        return send_file(str(path), mimetype=mimetype, conditional=True)

    @bp.route("/api/recordings/<recording_id>/segment/<int:segment_id>/regenerate", methods=["POST"])
    def regenerate_recording_segment(recording_id: str, segment_id: int):
        try:
            data = request.get_json(silent=False) or {}
        except BadRequest:
            return jsonify({"ok": False, "error": "invalid_json"}), 400
        if not isinstance(data, dict):
            return jsonify({"ok": False, "error": "json_object_required"}), 400
        text = str((data.get("text") or "")).strip()
        if not text:
            return jsonify({"ok": False, "error": "text_required"}), 400

        if not deps.recording_store.get(recording_id):
            return jsonify({"ok": False, "error": "not_found"}), 404

        seg = deps.recording_store.get_tts_segment(recording_id=recording_id, segment_id=int(segment_id))
        if not seg:
            return jsonify({"ok": False, "error": "segment_not_found"}), 404

        app_config = get_ragflow_config(deps=deps)
        provider, resolved_cfg = resolve_tts_request(app_config, data=data, headers=request.headers)
        provider_norm = str(provider or "").strip()
        if not provider_norm:
            return jsonify({"ok": False, "error": "tts_provider_required"}), 400

        try:
            request_id = f"rec_regen_{_file_part(recording_id, field='recording_id')}_{int(segment_id)}_{int(time.time() * 1000)}"
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400
        chunks: list[bytes] = []
        try:
            for chunk in deps.tts_service.stream(
                text=text,
                request_id=request_id,
                config=resolved_cfg,
                provider=provider_norm,
                endpoint="/api/recordings/segment/regenerate",
                segment_index=seg.get("segment_index"),
                cancel_event=threading.Event(),
            ):
                if chunk:
                    chunks.append(bytes(chunk))
        except Exception as e:
            deps.logger.warning(
                f"[REC] segment_regen_tts_failed recording_id={recording_id} segment_id={segment_id} provider={provider_norm} err={e}"
            )
            return jsonify({"ok": False, "error": "tts_failed", "detail": str(e)}), 502

        if not chunks:
            return jsonify({"ok": False, "error": "tts_empty_audio"}), 502

        wav_raw = b"".join(chunks)
        try:
            wav_bytes = ensure_wav_bytes(
                wav_raw,
                sample_rate=_guess_sample_rate(resolved_cfg=resolved_cfg, provider=provider_norm),
                channels=1,
                bits_per_sample=16,
            )
        except (TypeError, ValueError) as e:
            return jsonify({"ok": False, "error": "tts_sample_rate_invalid", "detail": str(e)}), 502
        if not wav_bytes:
            return jsonify({"ok": False, "error": "tts_audio_not_wav_compatible"}), 502

        seg_part = seg.get("segment_index")
        if seg_part is None:
            seg_part = segment_id
        try:
            filename = (
                f"{_file_part(str(seg.get('request_id') or request_id), field='request_id')}"
                f"_{_file_part(str(seg_part), field='segment_index')}_{int(time.time() * 1000)}.wav"
            )
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400

        audio_dir = deps.recording_store.audio_dir(recording_id)
        tmp_path = (audio_dir / f"{filename}.part").resolve()
        final_path = (audio_dir / filename).resolve()
        try:
            final_path = deps.recording_store.ensure_within_audio_dir(recording_id, final_path)
            tmp_path = deps.recording_store.ensure_within_audio_dir(recording_id, tmp_path)
        except ValueError:
            return jsonify({"ok": False, "error": "bad_path"}), 400

        try:
            with open(tmp_path, "wb") as f:
                f.write(wav_bytes)
            os.replace(str(tmp_path), str(final_path))
        except Exception as e:
            deps.logger.warning(
                f"[REC] segment_regen_write_failed recording_id={recording_id} segment_id={segment_id} err={e}"
            )
            return jsonify({"ok": False, "error": "audio_write_failed", "detail": str(e)}), 500

        updated = deps.recording_store.update_tts_segment(
            recording_id=recording_id,
            segment_id=int(segment_id),
            text=text,
            rel_path=filename,
        )
        if not updated:
            return jsonify({"ok": False, "error": "segment_not_found"}), 404

        old_rel = str(seg.get("rel_path") or "").replace("\\", "/").lstrip("/")
        if old_rel and old_rel != filename:
            try:
                ref_count = deps.recording_store.count_tts_rel_path_refs(
                    recording_id=recording_id,
                    rel_path=old_rel,
                    exclude_segment_id=int(segment_id),
                )
                if ref_count <= 0:
                    old_path = deps.recording_store.safe_rel_audio_path(recording_id, old_rel)
                    old_path = deps.recording_store.ensure_within_audio_dir(recording_id, old_path)
                    if old_path.exists() and old_path.is_file():
                        old_path.unlink()
            except Exception as e:
                deps.logger.warning(
                    f"[REC] segment_regen_old_audio_cleanup_failed recording_id={recording_id} segment_id={segment_id} err={e}"
                )
                return jsonify({"ok": False, "error": "old_audio_cleanup_failed", "detail": str(e)}), 500

        rel = str(updated.get("rel_path") or "").replace("\\", "/").lstrip("/")
        version_ms = int(updated.get("updated_at_ms") or updated.get("created_at_ms") or int(time.time() * 1000))
        audio_url = f"/api/recordings/{recording_id}/audio/{rel}"
        if version_ms > 0:
            audio_url = f"{audio_url}?v={version_ms}"

        deps.logger.info(
            f"[REC] segment_regen_ok recording_id={recording_id} segment_id={segment_id} provider={provider_norm} bytes={len(wav_bytes)}"
        )
        return jsonify(
            {
                "ok": True,
                "recording_id": str(recording_id),
                "segment": {
                    "segment_id": int(updated["id"]),
                    "stop_index": int(updated["stop_index"]),
                    "segment_index": int(updated["segment_index"]) if updated["segment_index"] is not None else None,
                    "seq": int(updated["seq"]),
                    "text": str(updated.get("text") or ""),
                    "audio_url": audio_url,
                    "updated_at_ms": version_ms,
                },
            }
        )

    return bp
