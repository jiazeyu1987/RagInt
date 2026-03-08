from __future__ import annotations

from backend.config.ops_env import OpsEnvConfig


class OpsAuth:
    @staticmethod
    def _tokens() -> tuple[str, str]:
        cfg = OpsEnvConfig.from_env()
        return cfg.admin_token, cfg.view_token

    @staticmethod
    def auth_disabled() -> bool:
        cfg = OpsEnvConfig.from_env()
        # When device auth is required, do NOT implicitly open ops endpoints even if ops tokens are unset.
        if cfg.device_auth_required:
            return False
        # Secure-by-default: do not open ops endpoints unless explicitly requested.
        if not cfg.open_access:
            return False
        return not cfg.admin_token and not cfg.view_token

    @staticmethod
    def role(req) -> str | None:
        if OpsAuth.auth_disabled():
            return "admin"
        admin, view = OpsAuth._tokens()
        got = str(req.headers.get("X-Ops-Token") or "").strip()
        if admin and got == admin:
            return "admin"
        if view and got == view:
            return "view"
        return None

    @staticmethod
    def require_view(req) -> bool:
        return OpsAuth.role(req) in ("admin", "view")

    @staticmethod
    def require_admin(req) -> bool:
        return OpsAuth.role(req) == "admin"

    @staticmethod
    def device_auth_required() -> bool:
        return bool(OpsEnvConfig.from_env().device_auth_required)

    @staticmethod
    def device_shared_secret_ok(req, data: dict) -> bool:
        secret = OpsEnvConfig.from_env().device_shared_secret
        if not secret:
            return True
        got = str(req.headers.get("X-Device-Shared-Secret") or data.get("shared_secret") or "").strip()
        return got == secret

    @staticmethod
    def device_token_ok(req, *, deps, device_id: str, data: dict | None = None) -> bool:
        did = str(device_id or "").strip()
        if not did:
            return False
        got = str(req.headers.get("X-Device-Token") or ((data or {}).get("device_token")) or "").strip()
        return bool(deps.ops_store.verify_device_token(device_id=did, token=got))
