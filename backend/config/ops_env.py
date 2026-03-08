from __future__ import annotations

from dataclasses import dataclass

from .env import env_bool, env_str


@dataclass(frozen=True)
class OpsEnvConfig:
    admin_token: str
    view_token: str
    device_auth_required: bool
    device_shared_secret: str
    open_access: bool

    @staticmethod
    def from_env() -> "OpsEnvConfig":
        admin = env_str("RAGINT_OPS_ADMIN_TOKEN") or env_str("RAGINT_OPS_TOKEN")
        view = env_str("RAGINT_OPS_VIEW_TOKEN")
        return OpsEnvConfig(
            admin_token=admin,
            view_token=view,
            device_auth_required=env_bool("RAGINT_DEVICE_AUTH_REQUIRED", False),
            device_shared_secret=env_str("RAGINT_DEVICE_SHARED_SECRET"),
            open_access=env_bool("RAGINT_OPS_OPEN_ACCESS", False),
        )
