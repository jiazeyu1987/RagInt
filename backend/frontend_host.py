from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, abort, redirect, send_from_directory


RESERVED_ROOT_PREFIXES = (
    "api",
    "health",
    "ops",
    "voicekit",
)


def _resolve_frontend_dir(explicit_env: str, default_dir: Path) -> Path | None:
    raw = str(explicit_env or "").strip()
    candidate = Path(raw).resolve() if raw else Path(default_dir).resolve()
    if not candidate.exists() or not candidate.is_dir():
        return None
    return candidate


def _safe_resolve(root: Path, path: str) -> Path | None:
    cleaned = str(path or "").replace("\\", "/").lstrip("/")
    target = (root / cleaned).resolve()
    if target == root or str(target).startswith(str(root) + "\\") or str(target).startswith(str(root) + "/"):
        return target
    return None


def _serve_spa_asset(root: Path, request_path: str, *, index_name: str = "index.html"):
    cleaned = str(request_path or "").replace("\\", "/").lstrip("/")
    if not cleaned:
        return send_from_directory(root, index_name)

    resolved = _safe_resolve(root, cleaned)
    if resolved and resolved.exists() and resolved.is_file():
        return send_from_directory(root, cleaned)

    if "." in Path(cleaned).name:
        abort(404)
    return send_from_directory(root, index_name)


def register_frontend_routes(*, app: Flask, repo_root: Path, logger) -> None:
    repo_root = Path(repo_root).resolve()
    pad_root = _resolve_frontend_dir(
        explicit_env=str(os.environ.get("RAGINT_PAD_FRONTEND_DIR") or ""),
        default_dir=repo_root / "pad-frontend",
    )
    ragint_root = _resolve_frontend_dir(
        explicit_env=str(os.environ.get("RAGINT_RAGINT_FRONTEND_DIR") or ""),
        default_dir=repo_root / "fronted" / "build-ragint",
    )

    if pad_root is None and ragint_root is None:
        logger.info("frontend_routes_skipped reason=no_static_dirs")
        return

    if ragint_root is not None:
        @app.route("/ragint")
        def ragint_root_redirect():
            return redirect("/ragint/", code=302)

        @app.route("/ragint/")
        @app.route("/ragint/<path:subpath>")
        def ragint_spa(subpath: str = ""):
            return _serve_spa_asset(ragint_root, subpath)

    if pad_root is not None:
        @app.route("/")
        @app.route("/<path:subpath>")
        def pad_spa(subpath: str = ""):
            normalized = str(subpath or "").replace("\\", "/").lstrip("/")
            if normalized:
                for prefix in RESERVED_ROOT_PREFIXES:
                    if normalized == prefix or normalized.startswith(prefix + "/"):
                        abort(404)
            return _serve_spa_asset(pad_root, normalized)

    logger.info(
        "frontend_routes_ready pad_root=%s ragint_root=%s",
        str(pad_root) if pad_root is not None else "",
        str(ragint_root) if ragint_root is not None else "",
    )
