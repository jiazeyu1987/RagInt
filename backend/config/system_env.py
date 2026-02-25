from __future__ import annotations

from dataclasses import dataclass

from .env import env_str


@dataclass(frozen=True)
class DiagnosticsEnvConfig:
    key: str

    @staticmethod
    def from_env() -> "DiagnosticsEnvConfig":
        return DiagnosticsEnvConfig(key=env_str("RAGINT_DIAGNOSTICS_KEY"))

