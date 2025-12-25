from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ConfigValidation:
    ok: bool
    errors: list[str]
    warnings: list[str]
    normalized: dict

    def to_dict(self) -> dict:
        return {
            "ok": bool(self.ok),
            "errors": list(self.errors or []),
            "warnings": list(self.warnings or []),
            "normalized": dict(self.normalized or {}),
        }


def _now_ts() -> str:
    return time.strftime("%Y%m%d_%H%M%S")


def _get_nested(d: dict, path: list[str], default=None):
    cur = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur.get(k)
    return cur


def _set_nested(d: dict, path: list[str], value) -> None:
    cur = d
    for k in path[:-1]:
        if not isinstance(cur.get(k), dict):
            cur[k] = {}
        cur = cur[k]
    cur[path[-1]] = value


class ConfigService:
    """
    Simple JSON config management for delivery/ops.
    - Export (scrub secrets)
    - Validate
    - Import with timestamped backup
    - List/restore backups
    """

    def __init__(self, *, config_path: Path, backup_dir: Path):
        self._config_path = Path(config_path)
        self._backup_dir = Path(backup_dir)

    @property
    def config_path(self) -> Path:
        return self._config_path

    @property
    def backup_dir(self) -> Path:
        return self._backup_dir

    def _ensure_backup_dir(self) -> None:
        self._backup_dir.mkdir(parents=True, exist_ok=True)

    def load_raw(self) -> dict:
        if self._config_path.exists():
            with open(self._config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        return {}

    @staticmethod
    def scrub_secrets(cfg: dict) -> dict:
        """
        Do not export or persist secrets into repo files.
        Keep the shape, blank the values.
        """
        out = json.loads(json.dumps(cfg or {}, ensure_ascii=False))
        if not isinstance(out, dict):
            return {}

        for path in (
            ["api_key"],
            ["asr", "dashscope", "api_key"],
            ["tts", "bailian", "api_key"],
        ):
            if _get_nested(out, path, None) is not None:
                _set_nested(out, path, "")

        return out

    def export_public(self) -> dict:
        raw = self.load_raw()
        return {"ok": True, "config": self.scrub_secrets(raw), "secrets_stripped": True}

    def validate(self, cfg: dict) -> ConfigValidation:
        errors: list[str] = []
        warnings: list[str] = []

        if not isinstance(cfg, dict):
            return ConfigValidation(ok=False, errors=["config_not_object"], warnings=[], normalized={})

        normalized = json.loads(json.dumps(cfg, ensure_ascii=False))
        if not isinstance(normalized, dict):
            normalized = {}

        # tour stops
        tour = normalized.get("tour")
        if tour is not None and not isinstance(tour, dict):
            errors.append("tour_not_object")
        stops = _get_nested(normalized, ["tour", "stops"], None)
        if stops is not None:
            if not isinstance(stops, list) or not any(str(x or "").strip() for x in stops):
                errors.append("tour.stops_invalid")

        # tour_planner
        tp = normalized.get("tour_planner")
        if tp is not None and not isinstance(tp, dict):
            errors.append("tour_planner_not_object")

        # nav
        nav = normalized.get("nav")
        if nav is not None and not isinstance(nav, dict):
            errors.append("nav_not_object")
        nav_provider = str(_get_nested(normalized, ["nav", "provider"], "disabled") or "disabled").strip().lower()
        if nav_provider not in ("disabled", "mock", "http"):
            errors.append("nav.provider_invalid")
        if nav_provider == "http":
            base_url = str(_get_nested(normalized, ["nav", "http", "base_url"], "") or "").strip()
            if not base_url:
                warnings.append("nav.http.base_url_empty")

        # timeouts/retries (best-effort)
        for key in ("timeout", "max_retries"):
            if key in normalized:
                try:
                    int(normalized.get(key))
                except Exception:
                    warnings.append(f"{key}_not_int")

        ok = not errors
        return ConfigValidation(ok=ok, errors=errors, warnings=warnings, normalized=normalized)

    def backup_current(self) -> str | None:
        if not self._config_path.exists():
            return None
        self._ensure_backup_dir()
        name = f"ragflow_config.{_now_ts()}.json"
        out = (self._backup_dir / name).resolve()
        # best-effort: avoid writing outside backup dir
        if self._backup_dir.resolve() not in out.parents:
            raise ValueError("backup_path_invalid")
        out.write_text(self._config_path.read_text(encoding="utf-8"), encoding="utf-8")
        return name

    def list_backups(self, *, limit: int = 50) -> list[dict]:
        self._ensure_backup_dir()
        items = []
        for p in sorted(self._backup_dir.glob("ragflow_config.*.json"), key=lambda x: x.name, reverse=True):
            try:
                st = p.stat()
            except Exception:
                continue
            items.append({"name": p.name, "size_bytes": int(st.st_size), "mtime_ms": int(st.st_mtime * 1000)})
            if len(items) >= int(limit):
                break
        return items

    def write_config(self, cfg: dict) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(cfg or {}, ensure_ascii=False, indent=2)
        self._config_path.write_text(text + "\n", encoding="utf-8")

    def import_config(self, cfg: dict) -> dict:
        v = self.validate(cfg)
        if not v.ok:
            return {"ok": False, "error": "config_invalid", "detail": v.to_dict()}

        backup = self.backup_current()
        safe_cfg = self.scrub_secrets(v.normalized)
        self.write_config(safe_cfg)
        return {"ok": True, "backup": backup, "secrets_stripped": True}

    def restore_backup(self, name: str) -> dict:
        self._ensure_backup_dir()
        name = str(name or "").strip()
        if not name or "/" in name or "\\" in name or ".." in name:
            return {"ok": False, "error": "backup_name_invalid"}
        src = (self._backup_dir / name).resolve()
        if self._backup_dir.resolve() not in src.parents:
            return {"ok": False, "error": "backup_path_invalid"}
        if not src.exists() or not src.is_file():
            return {"ok": False, "error": "backup_not_found"}

        backup = self.backup_current()
        self._config_path.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        return {"ok": True, "backup": backup, "restored": name}

