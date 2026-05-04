from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import time
from pathlib import Path


APP_NAME = "RagInt"
SEED_MARKER_NAME = ".ragint_seed.json"
SEED_EXCLUDED_ROOT_NAMES = {
    "__pycache__",
    "logs",
    "tmp_test_rw",
}
SEED_EXCLUDED_FILE_NAMES = {
    "app.log",
}


def _env_truthy(name: str) -> bool:
    raw = str(os.environ.get(name) or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def repo_root_from_base_dir(base_dir: Path) -> Path:
    return Path(base_dir).resolve().parent


def is_desktop_runtime() -> bool:
    return bool(getattr(sys, "frozen", False)) or _env_truthy("RAGINT_DESKTOP")


def resolve_runtime_data_dir(*, base_dir: Path) -> Path:
    explicit = str(os.environ.get("RAGINT_DATA_DIR") or "").strip()
    if explicit:
        return Path(explicit).resolve()

    repo_root = repo_root_from_base_dir(base_dir)
    if not is_desktop_runtime():
        return (repo_root / "backend" / "data").resolve()

    local_appdata = str(os.environ.get("LOCALAPPDATA") or "").strip()
    if local_appdata:
        return (Path(local_appdata) / APP_NAME / "data").resolve()
    return (repo_root / ".desktop-data" / "data").resolve()


def resolve_seed_data_dir(*, base_dir: Path) -> Path:
    explicit = str(os.environ.get("RAGINT_DATA_TEMPLATE_DIR") or "").strip()
    if explicit:
        return Path(explicit).resolve()
    repo_root = repo_root_from_base_dir(base_dir)
    return (repo_root / "backend" / "data").resolve()


def _is_same_path(a: Path, b: Path) -> bool:
    try:
        return a.resolve() == b.resolve()
    except Exception:
        return str(a) == str(b)


def _should_skip_seed_root(child: Path) -> bool:
    return child.name in SEED_EXCLUDED_ROOT_NAMES


def _should_skip_seed_file(rel_path: Path) -> bool:
    if rel_path.name in SEED_EXCLUDED_FILE_NAMES:
        return True
    parts = rel_path.parts
    if not parts:
        return False
    if parts[0] == "recordings" and len(parts) > 1:
        second = parts[1]
        if second and second != ".gitkeep" and second != "recordings.db":
            return True
    if rel_path.name.startswith("sauc_debug_") and rel_path.suffix.lower() == ".log":
        return True
    return False


def _copy_seed_tree(*, template_dir: Path, data_dir: Path) -> None:
    for child in template_dir.iterdir():
        if _should_skip_seed_root(child):
            continue
        if child.is_dir():
            for src in child.rglob("*"):
                rel = src.relative_to(template_dir)
                if _should_skip_seed_file(rel):
                    continue
                dst = (data_dir / rel).resolve()
                if src.is_dir():
                    dst.mkdir(parents=True, exist_ok=True)
                    continue
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
            continue
        rel = child.relative_to(template_dir)
        if _should_skip_seed_file(rel):
            continue
        dst = (data_dir / rel).resolve()
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(child, dst)


def copy_seed_template(*, source_dir: Path, dest_dir: Path) -> None:
    source_dir = Path(source_dir).resolve()
    dest_dir = Path(dest_dir).resolve()
    if dest_dir.exists():
        shutil.rmtree(dest_dir, ignore_errors=True)
    dest_dir.mkdir(parents=True, exist_ok=True)
    _copy_seed_tree(template_dir=source_dir, data_dir=dest_dir)
    (dest_dir / "logs").mkdir(parents=True, exist_ok=True)
    (dest_dir / "recordings").mkdir(parents=True, exist_ok=True)


def _write_seed_marker(*, data_dir: Path, source: Path, status: str) -> None:
    marker = data_dir / SEED_MARKER_NAME
    payload = {
        "status": str(status or "").strip() or "seeded",
        "source": str(source),
        "written_at_ms": int(time.time() * 1000),
    }
    marker.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ensure_runtime_data_seeded(*, data_dir: Path, template_dir: Path, logger: logging.Logger | None = None) -> None:
    log = logger or logging.getLogger(__name__)
    data_dir = Path(data_dir).resolve()
    template_dir = Path(template_dir).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    if _env_truthy("RAGINT_SKIP_DATA_SEED"):
        log.info("runtime_data_seed_skipped path=%s reason=env", str(data_dir))
        return
    if _is_same_path(data_dir, template_dir):
        return
    if not template_dir.exists() or not template_dir.is_dir():
        log.warning("runtime_data_seed_missing_template path=%s", str(template_dir))
        return

    marker = data_dir / SEED_MARKER_NAME
    if marker.exists():
        return

    essential_markers = [
        data_dir / "pad_products.db",
        data_dir / "ragflow_config.db",
        data_dir / "pad_product_audio",
        data_dir / "pad_product_images",
    ]
    if any(path.exists() for path in essential_markers):
        _write_seed_marker(data_dir=data_dir, source=template_dir, status="existing_data_preserved")
        return

    copy_seed_template(source_dir=template_dir, dest_dir=data_dir)
    _write_seed_marker(data_dir=data_dir, source=template_dir, status="seeded")
    log.info("runtime_data_seeded dst=%s src=%s", str(data_dir), str(template_dir))
