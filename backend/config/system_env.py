from __future__ import annotations

from dataclasses import dataclass

from .env import env_bool, env_str


@dataclass(frozen=True)
class DiagnosticsEnvConfig:
    key: str
    allow_without_key: bool

    @staticmethod
    def from_env() -> "DiagnosticsEnvConfig":
        return DiagnosticsEnvConfig(
            key=env_str("RAGINT_DIAGNOSTICS_KEY"),
            allow_without_key=env_bool("RAGINT_DIAGNOSTICS_ALLOW_NO_KEY", False),
        )
