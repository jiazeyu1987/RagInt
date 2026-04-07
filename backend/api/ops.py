from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.api.http_responses import bad_request_json, ok_json, unauthorized_json
from backend.api.ops_auth import OpsAuth
from backend.api.ops_console import render_ops_console
from backend.api.request_context import get_client_id
from backend.api.request_validators import json_body_dict, parse_int_or_default


def _parse_float_or_none(value):
    try:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        return float(text)
    except Exception:
        return None


def create_blueprint(deps):
    bp = Blueprint("ops_api", __name__)

    @bp.route("/ops", methods=["GET"])
    def ops_console():
        return render_ops_console()

    @bp.route("/api/ops/devices", methods=["GET"])
    def api_ops_devices_list():
        if not OpsAuth.require_view(request):
            return unauthorized_json()
        limit = parse_int_or_default(request.args.get("limit"), default=100, min_value=1, max_value=1000)
        items = deps.ops_store.list_devices(limit=limit)
        return jsonify(
            {
                "ok": True,
                "items": [
                    {
                        "device_id": d.device_id,
                        "name": d.name,
                        "model": d.model,
                        "version": d.version,
                        "last_seen_at_ms": d.last_seen_at_ms,
                        "meta": d.meta,
                    }
                    for d in items
                ],
            }
        )

    @bp.route("/api/ops/heartbeat", methods=["POST"])
    def api_ops_heartbeat():
        data = json_body_dict(request)
        device_id = str((data.get("device_id") or data.get("id") or "")).strip()
        name = data.get("name")
        model = data.get("model")
        version = data.get("version")
        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        if not device_id:
            return bad_request_json(error="device_id_required")
        if OpsAuth.device_auth_required() and (not OpsAuth.require_view(request)) and (
            not OpsAuth.device_token_ok(request, deps=deps, device_id=device_id, data=data)
        ):
            return unauthorized_json()
        ok = deps.ops_store.heartbeat(device_id=device_id, name=name, model=model, version=version, meta=meta)
        if not ok:
            return jsonify({"ok": False, "error": "save_failed"}), 500
        client_id = get_client_id(request, data=data, default="-")
        deps.event_store.emit(request_id=f"hb_{device_id}", client_id=client_id, kind="ops", name="heartbeat", device_id=device_id)
        try:
            deps.ops_store.audit(
                actor_kind="device",
                actor_id=device_id,
                action="heartbeat",
                target_kind="device",
                target_id=device_id,
                payload={"model": model, "version": version},
            )
        except Exception:
            pass
        return ok_json(device_id=device_id)

    @bp.route("/api/ops/config", methods=["GET"])
    def api_ops_get_config():
        device_id = str((request.args.get("device_id") or request.args.get("id") or "")).strip()
        if not device_id:
            return bad_request_json(error="device_id_required")
        if (not OpsAuth.require_view(request)) and (not OpsAuth.device_token_ok(request, deps=deps, device_id=device_id, data=None)):
            return unauthorized_json()
        cfg = deps.ops_store.get_config(device_id=device_id)
        if not cfg:
            return ok_json(device_id=device_id, config_version=0, config=None)
        return ok_json(device_id=device_id, config_version=cfg.config_version, config=cfg.config, updated_at_ms=cfg.updated_at_ms)

    @bp.route("/api/ops/config", methods=["POST"])
    def api_ops_set_config():
        if not OpsAuth.require_admin(request):
            return unauthorized_json()
        data = json_body_dict(request)
        device_id = str((data.get("device_id") or data.get("id") or "")).strip()
        cfg = data.get("config") if isinstance(data.get("config"), dict) else None
        if not device_id or cfg is None:
            return bad_request_json(error="invalid_input")

        saved = deps.ops_store.set_config(device_id=device_id, config=cfg)
        if not saved:
            return jsonify({"ok": False, "error": "save_failed"}), 500
        client_id = get_client_id(request, data=data, default="-")
        deps.event_store.emit(
            request_id=f"cfg_{device_id}_{saved.config_version}",
            client_id=client_id,
            kind="ops",
            name="set_config",
            device_id=device_id,
            config_version=saved.config_version,
        )
        try:
            deps.ops_store.audit(
                actor_kind="ops",
                actor_id=str(client_id or "-"),
                action="set_config",
                target_kind="device",
                target_id=device_id,
                payload={"config_version": saved.config_version},
            )
        except Exception:
            pass
        return ok_json(device_id=device_id, config_version=saved.config_version)

    @bp.route("/api/ops/register_device", methods=["POST"])
    def api_ops_register_device():
        data = json_body_dict(request)
        device_id = str((data.get("device_id") or data.get("id") or "")).strip()
        name = str((data.get("name") or "")).strip()
        model = str((data.get("model") or "")).strip()
        version = str((data.get("version") or "")).strip()
        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        if not device_id:
            return bad_request_json(error="device_id_required")
        if not OpsAuth.device_shared_secret_ok(request, data):
            return unauthorized_json()

        deps.ops_store.heartbeat(device_id=device_id, name=name, model=model, version=version, meta=meta)
        token = deps.ops_store.issue_device_token(device_id=device_id)
        if not token:
            return jsonify({"ok": False, "error": "save_failed"}), 500
        client_id = get_client_id(request, data=data, default="-")
        try:
            deps.ops_store.audit(
                actor_kind="ops" if OpsAuth.require_admin(request) else "device",
                actor_id=str(client_id or "-"),
                action="register_device",
                target_kind="device",
                target_id=device_id,
                payload={"model": model, "version": version},
            )
        except Exception:
            pass
        return ok_json(device_id=device_id, device_token=token)

    @bp.route("/api/ops/audit", methods=["GET"])
    def api_ops_audit_list():
        if not OpsAuth.require_view(request):
            return unauthorized_json()
        limit = parse_int_or_default(request.args.get("limit"), default=200, min_value=1, max_value=2000)
        target_kind = request.args.get("target_kind")
        target_id = request.args.get("target_id")
        events = deps.ops_store.list_audit(limit=limit, target_kind=target_kind, target_id=target_id)
        return jsonify(
            {
                "ok": True,
                "items": [
                    {
                        "id": e.id,
                        "ts_ms": e.ts_ms,
                        "actor_kind": e.actor_kind,
                        "actor_id": e.actor_id,
                        "action": e.action,
                        "target_kind": e.target_kind,
                        "target_id": e.target_id,
                        "payload": e.payload,
                    }
                    for e in events
                ],
            }
        )

    @bp.route("/api/ops/qa_audio_pairs", methods=["GET"])
    def api_ops_qa_audio_pairs():
        # Keep QA-audio cache inspection open in-app.
        host_base = str((request.host_url or "")).rstrip("/")
        limit = parse_int_or_default(request.args.get("limit"), default=100, min_value=1, max_value=500)
        offset = parse_int_or_default(request.args.get("offset"), default=0, min_value=0, max_value=10_000_000)
        provider = str((request.args.get("provider") or "")).strip()
        voice = str((request.args.get("voice") or "")).strip()
        speed = _parse_float_or_none(request.args.get("speed"))
        items = deps.qa_audio_cache_store.list_pairs(
            limit=limit,
            offset=offset,
            tts_provider=provider,
            tts_voice=voice,
            tts_speed=speed,
        )
        for item in items:
            try:
                pair_id = int(item.get("id") or 0)
            except Exception:
                pair_id = 0
            try:
                ver = int(item.get("updated_at_ms") or 0)
            except Exception:
                ver = 0
            if pair_id > 0:
                base = deps.qa_audio_cache_store.audio_url_for_pair(base_url=host_base, pair_id=pair_id)
                item["audio_url"] = f"{base}?v={ver}" if ver > 0 else base
            else:
                item["audio_url"] = ""
        return jsonify({"ok": True, "limit": limit, "offset": offset, "items": items})

    @bp.route("/api/ops/qa_audio_pairs/<int:pair_id>", methods=["DELETE"])
    def api_ops_qa_audio_pairs_delete(pair_id: int):
        deleted = deps.qa_audio_cache_store.delete_pair_hard(pair_id=int(pair_id))
        if not deleted:
            return jsonify({"ok": False, "error": "not_found"}), 404
        client_id = get_client_id(request, data=None, default="-")
        try:
            deps.ops_store.audit(
                actor_kind="ops",
                actor_id=str(client_id or "-"),
                action="qa_audio_pair_delete",
                target_kind="qa_audio_pair",
                target_id=str(pair_id),
                payload={},
            )
        except Exception:
            pass
        return ok_json(id=int(pair_id), deleted=True)

    @bp.route("/api/ops/qa_audio_pairs/cleanup_invalid_audio", methods=["POST"])
    def api_ops_qa_audio_pairs_cleanup_invalid_audio():
        result = deps.qa_audio_cache_store.cleanup_invalid_audio_pairs()
        client_id = get_client_id(request, data=None, default="-")
        try:
            deps.ops_store.audit(
                actor_kind="ops",
                actor_id=str(client_id or "-"),
                action="qa_audio_pair_cleanup_invalid_audio",
                target_kind="qa_audio_pair",
                target_id="*",
                payload={
                    "scanned": int(result.get("scanned") or 0),
                    "invalid": int(result.get("invalid") or 0),
                    "deleted": int(result.get("deleted") or 0),
                    "reason_counts": result.get("reason_counts") if isinstance(result.get("reason_counts"), dict) else {},
                },
            )
        except Exception:
            pass
        return ok_json(
            scanned=int(result.get("scanned") or 0),
            invalid=int(result.get("invalid") or 0),
            deleted=int(result.get("deleted") or 0),
            deleted_ids=result.get("deleted_ids") if isinstance(result.get("deleted_ids"), list) else [],
            reason_counts=result.get("reason_counts") if isinstance(result.get("reason_counts"), dict) else {},
        )

    return bp
