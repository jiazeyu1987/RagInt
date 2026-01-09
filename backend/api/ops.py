from __future__ import annotations

import os

from flask import Blueprint, jsonify, request

from backend.api.request_context import get_client_id


def _ops_tokens() -> tuple[str, str]:
    admin = str(os.environ.get("RAGINT_OPS_ADMIN_TOKEN") or os.environ.get("RAGINT_OPS_TOKEN") or "").strip()
    view = str(os.environ.get("RAGINT_OPS_VIEW_TOKEN") or "").strip()
    return admin, view


def _ops_auth_disabled() -> bool:
    admin, view = _ops_tokens()
    return not admin and not view


def _ops_role(req) -> str | None:
    if _ops_auth_disabled():
        return "admin"
    admin, view = _ops_tokens()
    got = str(req.headers.get("X-Ops-Token") or "").strip()
    if admin and got == admin:
        return "admin"
    if view and got == view:
        return "view"
    return None


def _require_ops_view(req) -> bool:
    role = _ops_role(req)
    return role in ("admin", "view")


def _require_ops_admin(req) -> bool:
    role = _ops_role(req)
    return role == "admin"


def _truthy_env(key: str, default: str = "0") -> bool:
    v = str(os.environ.get(key) or default).strip().lower()
    return v in ("1", "true", "yes", "y", "on")


def _device_auth_required() -> bool:
    return _truthy_env("RAGINT_DEVICE_AUTH_REQUIRED", "0")


def _device_shared_secret_ok(req, data: dict) -> bool:
    secret = str(os.environ.get("RAGINT_DEVICE_SHARED_SECRET") or "").strip()
    if not secret:
        return True
    got = str(req.headers.get("X-Device-Shared-Secret") or data.get("shared_secret") or "").strip()
    return got == secret


def _device_token_ok(req, *, deps, device_id: str, data: dict | None = None) -> bool:
    did = str(device_id or "").strip()
    if not did:
        return False
    got = str(req.headers.get("X-Device-Token") or ((data or {}).get("device_token")) or "").strip()
    return bool(deps.ops_store.verify_device_token(device_id=did, token=got))


def create_blueprint(deps):
    bp = Blueprint("ops_api", __name__)

    @bp.route("/ops", methods=["GET"])
    def ops_console():
        # Minimal HTML console for delivery / on-site ops (no build step required).
        return (
            """
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RagInt Ops</title>
    <style>
      body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; margin:16px; color:#111;}
      .row{display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:12px;}
      input,textarea,button{font:inherit; padding:8px;}
      textarea{width:100%; height:160px;}
      pre{background:#f6f8fa; padding:12px; overflow:auto; border-radius:6px;}
      .muted{color:#666; font-size:12px;}
      .btn{cursor:pointer;}
    </style>
  </head>
  <body>
    <h2>RagInt Ops Console</h2>
    <div class="row">
      <label>Ops Token（可选）：<input id="token" placeholder="X-Ops-Token" /></label>
      <button class="btn" id="refresh">刷新设备列表</button>
    </div>

    <h3>设备列表</h3>
    <div class="muted">接口：GET /api/ops/devices</div>
    <pre id="devices">{}</pre>

    <h3>下发配置（MVP）</h3>
    <div class="row">
      <label>device_id：<input id="deviceId" placeholder="d1" /></label>
      <button class="btn" id="loadCfg">读取当前配置</button>
      <button class="btn" id="pushCfg">下发配置</button>
    </div>
    <div class="muted">接口：GET/POST /api/ops/config</div>
    <textarea id="cfg" spellcheck="false">{}</textarea>
    <pre id="cfgOut"></pre>

    <script>
      const $ = (id) => document.getElementById(id);
      const tokenKey = 'ragint_ops_token';
      $('token').value = localStorage.getItem(tokenKey) || '';
      $('token').addEventListener('change', () => localStorage.setItem(tokenKey, $('token').value || ''));

      function headers() {
        const h = { 'Content-Type': 'application/json' };
        const t = String($('token').value || '').trim();
        if (t) h['X-Ops-Token'] = t;
        return h;
      }

      async function refreshDevices() {
        const r = await fetch('/api/ops/devices', { headers: headers() });
        const j = await r.json();
        $('devices').textContent = JSON.stringify(j, null, 2);
      }

      async function loadConfig() {
        const did = String($('deviceId').value || '').trim();
        if (!did) return alert('device_id required');
        const r = await fetch('/api/ops/config?device_id=' + encodeURIComponent(did), { headers: headers() });
        const j = await r.json();
        $('cfgOut').textContent = JSON.stringify(j, null, 2);
        $('cfg').value = JSON.stringify(j && j.config ? j.config : {}, null, 2);
      }

      async function pushConfig() {
        const did = String($('deviceId').value || '').trim();
        if (!did) return alert('device_id required');
        let cfg = {};
        try { cfg = JSON.parse($('cfg').value || '{}'); } catch (e) { return alert('config JSON invalid'); }
        const r = await fetch('/api/ops/config', { method: 'POST', headers: headers(), body: JSON.stringify({ device_id: did, config: cfg }) });
        const j = await r.json();
        $('cfgOut').textContent = JSON.stringify(j, null, 2);
        await refreshDevices();
      }

      $('refresh').addEventListener('click', refreshDevices);
      $('loadCfg').addEventListener('click', loadConfig);
      $('pushCfg').addEventListener('click', pushConfig);

      refreshDevices().catch(() => {});
    </script>
  </body>
</html>
            """.strip(),
            200,
            {"Content-Type": "text/html; charset=utf-8"},
        )

    @bp.route("/api/ops/devices", methods=["GET"])
    def api_ops_devices_list():
        if not _require_ops_view(request):
            return jsonify({"ok": False, "error": "unauthorized"}), 401
        try:
            limit = int(request.args.get("limit") or 100)
        except Exception:
            limit = 100
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
        data = request.get_json() or {}
        device_id = str((data.get("device_id") or data.get("id") or "")).strip()
        name = data.get("name")
        model = data.get("model")
        version = data.get("version")
        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        if not device_id:
            return jsonify({"ok": False, "error": "device_id_required"}), 400
        if _device_auth_required() and (not _require_ops_view(request)) and (not _device_token_ok(request, deps=deps, device_id=device_id, data=data)):
            return jsonify({"ok": False, "error": "unauthorized"}), 401
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
        return jsonify({"ok": True, "device_id": device_id})

    @bp.route("/api/ops/config", methods=["GET"])
    def api_ops_get_config():
        device_id = str((request.args.get("device_id") or request.args.get("id") or "")).strip()
        if not device_id:
            return jsonify({"ok": False, "error": "device_id_required"}), 400
        if (not _require_ops_view(request)) and (not _device_token_ok(request, deps=deps, device_id=device_id, data=None)):
            return jsonify({"ok": False, "error": "unauthorized"}), 401
        cfg = deps.ops_store.get_config(device_id=device_id)
        if not cfg:
            return jsonify({"ok": True, "device_id": device_id, "config_version": 0, "config": None})
        return jsonify({"ok": True, "device_id": device_id, "config_version": cfg.config_version, "config": cfg.config, "updated_at_ms": cfg.updated_at_ms})

    @bp.route("/api/ops/config", methods=["POST"])
    def api_ops_set_config():
        if not _require_ops_admin(request):
            return jsonify({"ok": False, "error": "unauthorized"}), 401
        data = request.get_json() or {}
        device_id = str((data.get("device_id") or data.get("id") or "")).strip()
        cfg = data.get("config") if isinstance(data.get("config"), dict) else None
        if not device_id or cfg is None:
            return jsonify({"ok": False, "error": "invalid_input"}), 400

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
        return jsonify({"ok": True, "device_id": device_id, "config_version": saved.config_version})

    @bp.route("/api/ops/register_device", methods=["POST"])
    def api_ops_register_device():
        data = request.get_json() or {}
        device_id = str((data.get("device_id") or data.get("id") or "")).strip()
        name = str((data.get("name") or "")).strip()
        model = str((data.get("model") or "")).strip()
        version = str((data.get("version") or "")).strip()
        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        if not device_id:
            return jsonify({"ok": False, "error": "device_id_required"}), 400
        if not _device_shared_secret_ok(request, data):
            return jsonify({"ok": False, "error": "unauthorized"}), 401

        deps.ops_store.heartbeat(device_id=device_id, name=name, model=model, version=version, meta=meta)
        token = deps.ops_store.issue_device_token(device_id=device_id)
        if not token:
            return jsonify({"ok": False, "error": "save_failed"}), 500
        client_id = get_client_id(request, data=data, default="-")
        try:
            deps.ops_store.audit(
                actor_kind="ops" if _require_ops_admin(request) else "device",
                actor_id=str(client_id or "-"),
                action="register_device",
                target_kind="device",
                target_id=device_id,
                payload={"model": model, "version": version},
            )
        except Exception:
            pass
        return jsonify({"ok": True, "device_id": device_id, "device_token": token})

    @bp.route("/api/ops/audit", methods=["GET"])
    def api_ops_audit_list():
        if not _require_ops_view(request):
            return jsonify({"ok": False, "error": "unauthorized"}), 401
        try:
            limit = int(request.args.get("limit") or 200)
        except Exception:
            limit = 200
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

    return bp
